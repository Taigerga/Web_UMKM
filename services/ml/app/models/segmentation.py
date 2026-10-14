# app/models/segmentation.py
"""RFM + K-Means segmentation with silhouette-based K selection."""
import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

from app.core import config as cfg
from app.preprocessing.loader import rfm_table


class SegmentationModel:
    def __init__(self, artifacts_dir=None):
        self.artifacts_dir = Path(artifacts_dir or cfg.settings.ARTIFACTS_DIR) / "segmentation/v1"
        self.scaler = None
        self.model = None
        self.k = 4
        self.assignments = None
        self.metrics = {}

    def train(self, df, k_range=range(2, 9)):
        rfm = rfm_table(df)
        # scale
        X = rfm[["recency", "frequency", "monetary"]].to_numpy(dtype=float)
        self.scaler = StandardScaler()
        Xs = self.scaler.fit_transform(X)
        best_k, best_score = 4, -1
        scores = {}
        for k in k_range:
            km = KMeans(n_clusters=k, random_state=cfg.settings.RANDOM_STATE, n_init=10)
            lab = km.fit_predict(Xs)
            if len(set(lab)) < 2:
                scores[k] = None
                continue
            sc = silhouette_score(Xs, lab)
            scores[k] = float(sc)
            if sc > best_score:
                best_score, best_k = sc, k
        self.k = int(best_k)
        self.model = KMeans(n_clusters=self.k, random_state=cfg.settings.RANDOM_STATE, n_init=10)
        labels = self.model.fit_predict(Xs)
        rfm = rfm.copy()
        rfm["cluster"] = labels

        # label clusters by composite score (RFM score: lower recency + higher freq/monetary)
        agg = rfm.groupby("cluster").agg({
            "recency": "mean", "frequency": "mean", "monetary": "mean",
        })
        # composite: normalize and invert recency
        from sklearn.preprocessing import MinMaxScaler
        mm = MinMaxScaler()
        an = mm.fit_transform(agg)
        score = (1 - an[:, 0]) + an[:, 1] + an[:, 2]  # higher is better
        order = np.argsort(score)[::-1]  # best clusters first
        label_pool = ["Pelanggan Setia (VIP)", "Pelanggan Potensial", "Pelanggan Baru", "Pelanggan Berisiko", "Segmen 5", "Segmen 6", "Segmen 7", "Segmen 8"]
        mapping = {int(c): label_pool[i] for i, c in enumerate(order)}
        rfm["segment"] = rfm["cluster"].map(mapping)

        self.assignments = rfm[["customer_id", "segment", "cluster", "recency", "frequency", "monetary", "tenure", "avg_order_value"]]
        metrics = {
            "k": self.k,
            "best_silhouette": float(best_score),
            "silhouette_by_k": scores,
            "n_customers": int(len(rfm)),
            "segments": {lbl: int((rfm["segment"] == lbl).sum()) for lbl in rfm["segment"].unique()},
        }
        # revenue per segment
        rev = {lbl: float(rfm.loc[rfm["segment"] == lbl, "monetary"].sum()) for lbl in rfm["segment"].unique()}
        metrics["revenue_by_segment"] = rev
        self.metrics = metrics
        return metrics

    def infer(self):
        if self.assignments is None:
            self.load()
        agg = self.assignments.groupby("segment").agg(
            customers=("customer_id", "count"),
            revenue=("monetary", "sum"),
            recency=("recency", "mean"),
            frequency=("frequency", "mean"),
        ).reset_index()
        segments = []
        for _, r in agg.iterrows():
            pct = r["revenue"] / agg["revenue"].sum() * 100 if agg["revenue"].sum() else 0
            segments.append({
                "segment": r["segment"],
                "customers": int(r["customers"]),
                "customer_pct": round(r["customers"] / agg["customers"].sum() * 100, 1),
                "revenue": float(r["revenue"]),
                "revenue_pct": round(float(pct), 1),
                "recency_avg": float(r["recency"]),
                "frequency_avg": float(r["frequency"]),
            })
        return {
            "segments": segments,
            "metadata": {"model": "rfm+kmeans", "k": self.k, "metrics": self.metrics},
        }

    def save(self):
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump({"scaler": self.scaler, "model": self.model, "k": self.k, "assignments": self.assignments, "metrics": self.metrics}, self.artifacts_dir / "model.pkl")
        (self.artifacts_dir / "metadata.json").write_text(json.dumps(self.metrics, indent=2, default=str))

    def load(self):
        p = self.artifacts_dir / "model.pkl"
        if not p.exists():
            raise FileNotFoundError("segmentation model not trained")
        obj = joblib.load(p)
        self.scaler = obj["scaler"]; self.model = obj["model"]; self.k = obj["k"]
        self.assignments = obj["assignments"]; self.metrics = obj["metrics"]
