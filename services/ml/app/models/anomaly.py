# app/models/anomaly.py
"""Anomaly detection: robust z (rolling MAD) + Isolation Forest."""
import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from app.core import config as cfg
from app.preprocessing.loader import daily_sales


class AnomalyModel:
    def __init__(self, artifacts_dir=None, contamination=0.02, window=7, z_threshold=3.5):
        self.artifacts_dir = Path(artifacts_dir or cfg.settings.ARTIFACTS_DIR) / "anomaly_detection/v1"
        self.contamination = contamination
        self.window = window
        self.z_threshold = z_threshold
        self.daily = None
        self.iso = None
        self.metrics = {}

    def train(self, df):
        d = daily_sales(df).sort_values("date").reset_index(drop=True)
        # rolling robust z using median + MAD
        d["roll_med"] = d["sales"].rolling(self.window, min_periods=3).median()
        mad = lambda s: np.median(np.abs(s - np.median(s)))
        d["roll_mad"] = d["sales"].rolling(self.window, min_periods=3).apply(mad, raw=True)
        denom = 1.4826 * d["roll_mad"]
        d["robust_z"] = (d["sales"] - d["roll_med"]) / denom.replace(0, np.nan)

        # Isolation forest on features
        feats = d[["sales", "orders"]].fillna(0).to_numpy(dtype=float)
        sc = StandardScaler()
        Xs = sc.fit_transform(feats)
        iso = IsolationForest(contamination=self.contamination, random_state=cfg.settings.RANDOM_STATE)
        pred = iso.fit_predict(Xs)
        d["iso_flag"] = (pred == -1).astype(int)
        d["robust_flag"] = (d["robust_z"].abs() > self.z_threshold).astype(int)

        self.daily = d
        self.iso = iso
        self.scaler = sc
        self.metrics = {
            "n_days": int(len(d)),
            "robust_flagged": int(d["robust_flag"].sum()),
            "iso_flagged": int(d["iso_flag"].sum()),
            "window": self.window,
            "z_threshold": self.z_threshold,
            "contamination": self.contamination,
        }
        return self.metrics

    def infer(self):
        if self.daily is None:
            self.load()
        d = self.daily
        flagged = d[(d["robust_flag"] == 1) | (d["iso_flag"] == 1)].copy()
        anomalies = []
        for _, r in flagged.sort_values("date").iterrows():
            baseline = float(r["roll_med"]) if pd.notna(r["roll_med"]) else None
            anomalies.append({
                "date": str(r["date"].date()),
                "actual_sales": float(r["sales"]),
                "baseline": baseline,
                "robust_z": float(r["robust_z"]) if pd.notna(r["robust_z"]) else None,
                "type": "spike" if (baseline is None or r["sales"] > baseline) else "drop",
                "flag_source": "robust_z" if r["robust_flag"] == 1 else "isolation_forest",
            })
        return {"anomalies": anomalies, "n_total": int(len(d)), "metadata": {"model": "isolation_forest+robust_z", "metrics": self.metrics}}

    def save(self):
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump({"daily": self.daily, "iso": self.iso, "scaler": self.scaler, "metrics": self.metrics, "params": (self.contamination, self.window, self.z_threshold)}, self.artifacts_dir / "model.pkl")
        (self.artifacts_dir / "metadata.json").write_text(json.dumps(self.metrics, indent=2, default=str))

    def load(self):
        p = self.artifacts_dir / "model.pkl"
        if not p.exists():
            raise FileNotFoundError("anomaly model not trained")
        obj = joblib.load(p)
        self.daily = obj["daily"]; self.iso = obj["iso"]; self.scaler = obj["scaler"]
        self.metrics = obj["metrics"]; self.contamination, self.window, self.z_threshold = obj["params"]
