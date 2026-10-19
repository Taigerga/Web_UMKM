# app/inference/per_store.py
"""Inferensi per-toko dari data yang dikirim request - tanpa artefak global.

## Kenapa modul ini ada

Promt §13.2: NestJS menyiapkan data toko yang relevan, lalu mengirimkannya ke
service ini; hasilnya harus tentang toko itu. Artefak global (hasil training
di `artifacts/`) dilatih dari dataset penelitian, sehingga kalau job per-toko
hanya memanggil artefak itu, dashboard menampilkan angka yang tidak berasal
dari toko - itu bug kepercayaan, bukan sekadar angka salah.

## Prinsip

- **Metode sama, sumber data beda.** Statistik yang dipakai persis baseline
  training: seasonal-naive (forecast), robust-z rolling MAD (anomali),
  FP-Growth (basket), K-Means + siluet + pelabelan profil cluster
  (segmentasi).
- **Jujur saat data tidak layak.** Promt §10.6: kalau data tidak mendukung
  model, jangan mengarang hasil. Data kosong/kurang menolak dengan ValueError
  (HTTP 400) atau mengembalikan segmen tunggal dengan catatan data terbatas.
- **Churn per toko memakai aturan terbuka, bukan berpura-pura XGBoost.**
  Membentuk label churn butuh periode observasi dua kali horizon; data satu
  toko praktis tidak pernah cukup. Probabilitas dihitung dari recency
  relatif ke horizon 90 hari - transparan dan tercatat di metadata.
"""
from typing import Any

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Bantu
# ---------------------------------------------------------------------------


def _to_daily(series: list[dict[str, Any]] | None) -> pd.DataFrame:
    """List {date,sales} -> DataFrame harian padat (tanggal hilang = 0)."""
    if not series:
        raise ValueError("Data penjualan toko kosong; analisis belum layak dijalankan.")
    s = pd.DataFrame(list(series), columns=["date", "sales"])
    s["date"] = pd.to_datetime(s["date"], errors="coerce")
    s = s.dropna(subset=["date"])
    s = s.groupby("date", as_index=False)["sales"].sum()
    if len(s) == 0:
        raise ValueError("Data penjualan toko kosong; analisis belum layak dijalankan.")
    # Isi tanggal hilang dengan 0 supaya basis 7 hari konsisten.
    full = pd.DataFrame({"date": pd.date_range(s["date"].min(), s["date"].max(), freq="D")})
    return full.merge(s, on="date", how="left").fillna({"sales": 0.0}).sort_values("date").reset_index(drop=True)


# ---------------------------------------------------------------------------
# Forecast (seasonal-naive per toko)
# ---------------------------------------------------------------------------


def run_forecast(series: list[dict[str, Any]], horizon_days: int = 30) -> dict[str, Any]:
    """Baseline seasonal-naive: nilai rata-rata pada posisi hari yang sama.

    Untuk setiap tanggal horizon, prediksi = mean deret pada weekday yang
    sama di jendela 56 hari terakhir (8 minggu; 28 hari kalau data lebih
    pendek). Interval = prediksi ± 1.96 * sigma trailing-28. `seasonal_naive`
    adalah salah satu kandidat yang sama dengan training, hanya sumber
    datanya yang berubah, sehingga bentuk hasil identik.
    """
    d = _to_daily(series)
    if horizon_days < 1:
        raise ValueError("horizon_days minimal 1.")

    y = d["sales"].to_numpy(dtype=float)
    n = len(y)
    last_date = d["date"].iloc[-1]
    window = 56 if n >= 56 else 28
    trailing = y[-window:] if n >= window else y

    forecasts = []
    for step in range(1, horizon_days + 1):
        horizon_date = last_date + pd.Timedelta(days=step)
        idx = np.arange(len(trailing))
        same_weekday = trailing[idx % 7 == horizon_date.weekday()]
        if len(same_weekday) == 0:
            same_weekday = trailing
        predicted = float(max(0.0, np.mean(same_weekday)))
        sigma = float(np.std(trailing, ddof=1)) if len(trailing) >= 2 else abs(predicted)
        if sigma <= 0:
            sigma = max(1.0, predicted * 0.1)
        forecasts.append({
            "date": str(horizon_date.date()),
            "predicted": predicted,
            "lower": float(max(0.0, predicted - 1.96 * sigma)),
            "upper": float(predicted + 1.96 * sigma),
        })

    return {
        "forecasts": forecasts,
        "horizon_days": int(horizon_days),
        "metadata": {
            "model": "seasonal_naive_per_store",
            "n_days": int(n),
            "data_start": str(d["date"].iloc[0].date()),
            "data_end": str(last_date.date()),
            "note": "Baseline musiman dari deret penjualan toko ini, bukan artefak global.",
        },
    }


# ---------------------------------------------------------------------------
# Anomali (robust-z rolling MAD, sama seperti training)
# ---------------------------------------------------------------------------

_WINDOW = 7
_MIN_PERIODS = 3
_Z_THRESHOLD = 3.5
_MAD_SCALE = 1.4826


def run_anomaly(series: list[dict[str, Any]]) -> dict[str, Any]:
    """Anomali harian per toko memakai robust-z (median+MAD rolling 7 hari).

    Rumus identik dengan `AnomalyModel.train` (window 7, min_periods 3,
    threshold 3.5, skala 1.4826) supaya perbandingannya konsisten. Isolation
    Forest pada training memakai fitur jumlah order yang tidak tersedia di
    payload per-toko, jadi hanya robust-z yang aktif di sini.
    """
    d = _to_daily(series)
    d["roll_med"] = d["sales"].rolling(_WINDOW, min_periods=_MIN_PERIODS).median()

    def mad(win: np.ndarray) -> float:
        return float(np.median(np.abs(win - np.median(win))))

    d["roll_mad"] = d["sales"].rolling(_WINDOW, min_periods=_MIN_PERIODS).apply(mad, raw=True)
    denom = _MAD_SCALE * d["roll_mad"]
    d["robust_z"] = (d["sales"] - d["roll_med"]) / denom.replace(0, np.nan)

    flagged = d[d["robust_z"].abs() > _Z_THRESHOLD]
    anomalies = []
    for _, r in flagged.iterrows():
        baseline = float(r["roll_med"]) if pd.notna(r["roll_med"]) else None
        anomalies.append({
            "date": str(r["date"].date()),
            "actual_sales": float(r["sales"]),
            "baseline": baseline,
            "robust_z": float(r["robust_z"]) if pd.notna(r["robust_z"]) else None,
            "type": "spike" if (baseline is None or r["sales"] > baseline) else "drop",
            "flag_source": "robust_z",
        })
    return {
        "anomalies": anomalies,
        "n_total": int(len(d)),
        "metadata": {
            "model": "robust_z_per_store",
            "window": _WINDOW,
            "z_threshold": _Z_THRESHOLD,
            "note": "Penanda berarti pola perlu ditinjau, bukan otomatis fraud.",
        },
    }


# ---------------------------------------------------------------------------
# Segmentasi (RFM + K-Means per toko)
# ---------------------------------------------------------------------------

_LABEL_POOL = [
    "Pelanggan Setia (VIP)",
    "Pelanggan Potensial",
    "Pelanggan Baru",
    "Pelanggan Berisiko",
]


def run_segmentation(customers: list[dict[str, Any]]) -> dict[str, Any]:
    """RFM + K-Means dari baris RFM per toko (recency/frequency/monetary).

    K dipilih dari siluet 2..min(6, n-1) - pendekatan sama dengan training.
    Label bisnis diberikan dari profil cluster (bukan nomornya), pakai
    skor komposit yang sama: (1 - recency_norm) + frequency + monetary.
    n < 5 => satu segmen dengan catatan data terbatas.
    """
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import MinMaxScaler, StandardScaler

    if not customers:
        return {
            "segments": [],
            "metadata": {
                "model": "rfm+kmeans_per_store",
                "n_customers": 0,
                "note": "Belum ada pelanggan; segmentasi belum layak dijalankan.",
            },
        }

    rfm = pd.DataFrame(list(customers))
    rfm.columns = [str(c) for c in rfm.columns]
    for col in ("recency", "frequency", "monetary"):
        if col not in rfm.columns:
            raise ValueError(f"Kolom {col} wajib ada di payload pelanggan.")
        rfm[col] = pd.to_numeric(rfm[col], errors="coerce").fillna(0.0).astype(float)
    n = len(rfm)

    if n < 5:
        total_rev = float(rfm["monetary"].sum())
        return {
            "segments": [{
                "segment": "Pelanggan (data terbatas)",
                "customers": n,
                "customer_pct": 100.0,
                "revenue_pct": 100.0,
                "revenue": total_rev,
                "recency_avg": float(rfm["recency"].mean()),
                "frequency_avg": float(rfm["frequency"].mean()),
            }],
            "metadata": {
                "model": "rfm+kmeans_per_store",
                "n_customers": n,
                "note": f"Baru {n} pelanggan; kurang dari 5 belum cukup untuk clustering.",
            },
        }

    X = rfm[["recency", "frequency", "monetary"]].to_numpy(dtype=float)
    Xs = StandardScaler().fit_transform(X)

    k_max = min(6, n - 1)
    best_k, best_score = 2, -1.0
    for k in range(2, k_max + 1):
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        lab = km.fit_predict(Xs)
        if len(set(lab)) < 2:
            continue
        sc = float(silhouette_score(Xs, lab))
        if sc > best_score:
            best_score, best_k = sc, k
    km = KMeans(n_clusters=best_k, random_state=42, n_init=10)
    rfm["cluster"] = km.fit_predict(Xs)

    agg = rfm.groupby("cluster").agg({"recency": "mean", "frequency": "mean", "monetary": "mean"})
    an = MinMaxScaler().fit_transform(agg)
    score = (1 - an[:, 0]) + an[:, 1] + an[:, 2]
    order = np.argsort(score)[::-1]
    mapping = {int(c): _LABEL_POOL[i % len(_LABEL_POOL)] for i, c in enumerate(order)}
    rfm["segment"] = rfm["cluster"].map(mapping)

    total_revenue = float(rfm["monetary"].sum())
    segments = []
    for label, grp in rfm.groupby("segment"):
        revenue = float(grp["monetary"].sum())
        segments.append({
            "segment": label,
            "customers": int(len(grp)),
            "customer_pct": round(len(grp) / n * 100, 1),
            "revenue_pct": round(revenue / (total_revenue or 1.0) * 100, 1),
            "revenue": revenue,
            "recency_avg": float(grp["recency"].mean()),
            "frequency_avg": float(grp["frequency"].mean()),
        })

    return {
        "segments": segments,
        "metadata": {
            "model": "rfm+kmeans_per_store",
            "k": int(best_k),
            "best_silhouette": float(best_score),
            "n_customers": int(n),
            "note": "Label diberikan dari profil cluster yang dihitung dari data toko ini.",
        },
    }


# ---------------------------------------------------------------------------
# Market basket (FP-Growth; ambang support menyesuaikan volume toko)
# ---------------------------------------------------------------------------


def run_basket(transactions: list[dict[str, Any]], top_k: int = 20) -> dict[str, Any]:
    """FP-Growth atas transaksi toko: baris {order_id, product}."""
    from mlxtend.frequent_patterns import association_rules, fpgrowth
    from mlxtend.preprocessing import TransactionEncoder

    if not transactions:
        return {
            "rules": [],
            "metadata": {
                "model": "fp_growth_per_store",
                "n_transactions": 0,
                "note": "Belum ada transaksi; analisis bundling belum layak.",
            },
        }

    grp = pd.DataFrame(list(transactions))
    grp.columns = [str(c) for c in grp.columns]
    sets = grp.groupby("order_id")["product"].apply(list).reset_index()
    if len(sets) < 4:
        return {
            "rules": [],
            "metadata": {
                "model": "fp_growth_per_store",
                "n_transactions": int(len(sets)),
                "note": "Volume transaksi masih kecil; hasil aturan belum kuat.",
            },
        }

    te = TransactionEncoder()
    te_ary = te.fit(sets["product"].tolist()).transform(sets["product"].tolist())
    pdf = pd.DataFrame(te_ary, columns=te.columns_)
    # Ambang support disesuaikan dengan volume: minimal ~2 transaksi
    # memuat itemset; di bawah itu aturan tidak bermakna.
    min_support = max(2.0 / len(pdf), 0.02)
    frequent = fpgrowth(pdf, min_support=min_support, use_colnames=True)
    if len(frequent) == 0:
        return {
            "rules": [],
            "metadata": {
                "model": "fp_growth_per_store",
                "n_transactions": int(len(sets)),
                "min_support": min_support,
                "note": "Belum ada itemset yang sering muncul pada volume saat ini.",
            },
        }
    r = association_rules(frequent, metric="lift", min_threshold=1.0)
    r = r[r["confidence"] >= 0.01].sort_values("lift", ascending=False).head(max(1, top_k))

    rules = [{
        "antecedent": sorted([str(x) for x in row["antecedents"]]),
        "consequent": sorted([str(x) for x in row["consequents"]]),
        "support": float(row["support"]),
        "confidence": float(row["confidence"]),
        "lift": float(row["lift"]),
    } for _, row in r.iterrows()]

    return {
        "rules": rules,
        "metadata": {
            "model": "fp_growth_per_store",
            "n_transactions": int(len(sets)),
            "min_support": min_support,
            "note": "Asosiasi bukan sebab-kerucut; lift > 1 berarti kemunculan bersama lebih kuat dari kebetulan.",
        },
    }


# ---------------------------------------------------------------------------
# Churn (aturan recency; horizon 90 hari - definisi sama dengan training)
# ---------------------------------------------------------------------------

_CHURN_HORIZON_DAYS = 90


def run_churn(customers: list[dict[str, Any]], top_k: int = 50) -> dict[str, Any]:
    """Skor risiko per pelanggan dari recency relatif ke horizon 90 hari.

    Definisi churn training = tidak beli dalam 90 hari. Model klasifikasi
    butuh label dari dua periode horizon; untuk satu toko itu biasanya tidak
    tersedia, jadi probabilitas dihitung aturan terbuka: naik linear dari
    recency 60 -> 90 hari, recency >= 90 dianggap berisiko penuh. Ambang bin
    Low/Medium/High mengikuti cut probability training (0.33 / 0.66).
    """
    if not customers:
        return {
            "summary": {"Low": 0, "Medium": 0, "High": 0},
            "high_risk_customers": [],
            "metadata": {
                "model": "rule_based_recency",
                "n_customers": 0,
                "note": "Belum ada pelanggan; risiko churn belum layak dihitung.",
            },
        }

    scored = []
    for c in customers:
        recency = float(c.get("recency", 0) or 0)
        prob = min(1.0, max(0.0, (recency - 60.0) / 30.0))
        level = "High" if prob >= 0.66 else ("Medium" if prob >= 0.33 else "Low")
        scored.append({
            "customer_id": str(c.get("customer_id", "")),
            "recency": recency,
            "frequency": float(c.get("frequency", 0) or 0),
            "monetary": float(c.get("monetary", 0) or 0),
            "churn_probability": prob,
            "risk_level": level,
        })

    summary = {"Low": 0, "Medium": 0, "High": 0}
    for s in scored:
        summary[s["risk_level"]] += 1

    high = sorted(scored, key=lambda s: (-s["churn_probability"], -s["monetary"]))[: max(1, top_k)]
    high_risk = [{
        "customer_id": s["customer_id"],
        "churn_probability": float(s["churn_probability"]),
        "risk_level": s["risk_level"],
        "recency": int(s["recency"]),
        "frequency": int(s["frequency"]),
        "monetary": float(s["monetary"]),
    } for s in high]

    return {
        "summary": summary,
        "high_risk_customers": high_risk,
        "metadata": {
            "model": "rule_based_recency",
            "horizon_days": _CHURN_HORIZON_DAYS,
            "n_customers": int(len(scored)),
            "note": "Probabilitas dari recency terhadap horizon 90 hari, bukan model terlatih global.",
        },
    }
