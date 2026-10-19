import random
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Per-store inference (Promt §13.2): NestJS mengirim data toko, ML menjalankan
# metode yang sama seperti training, hasil harus tentang data toko itu -
# bukan artefak global. Endpoint /x/run menerima payload dan tidak boleh
# memakai artefak global sama sekali.
# ---------------------------------------------------------------------------


def _series(n_days: int, base: float = 100.0, spike_last: int = 0, spike_mul: float = 5.0):
    out = []
    d0 = date(2026, 1, 1)
    rng = random.Random(7)
    for i in range(n_days):
        value = base + rng.uniform(-base * 0.2, base * 0.2)
        if spike_last > 0 and i >= n_days - spike_last:
            value = value * spike_mul
        out.append({"date": (d0 + timedelta(days=i)).isoformat(), "sales": round(value, 2)})
    return out


def test_forecast_run_returns_horizon_points():
    res = client.post("/forecast/run", json={"series": _series(30), "horizon_days": 14})
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["forecasts"]) == 14
    assert all(set(f.keys()) == {"date", "predicted", "lower", "upper"} for f in body["forecasts"])
    # hasil per-toko, bukan global: metadata menyatakan model per toko
    assert "per_store" in body["metadata"]["model"]


def test_forecast_run_dates_continue_after_last_observation():
    res = client.post("/forecast/run", json={"series": _series(10), "horizon_days": 7})
    assert res.status_code == 200
    body = res.json()
    assert body["forecasts"][0]["date"] == "2026-01-11"
    assert body["forecasts"][-1]["date"] == "2026-01-17"


def test_forecast_run_empty_series_is_rejected():
    res = client.post("/forecast/run", json={"series": [], "horizon_days": 7})
    assert res.status_code == 400
    assert "cosong" in res.text or "kosong" in res.text


def test_anomaly_run_flags_spike_with_full_shape():
    res = client.post("/anomaly/run", json={"series": _series(40, spike_last=5)})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["n_total"] == 40
    assert len(body["anomalies"]) > 0
    for a in body["anomalies"]:
        assert set(a.keys()) >= {"date", "actual_sales", "baseline", "type"}
        assert a["type"] in {"spike", "drop"}


def test_segmentation_run_from_rfm_rows():
    customers = [
        {"customer_id": f"c{i}", "recency": 10 + i, "frequency": 1 + (i % 5), "monetary": 100.0 * (i + 1)}
        for i in range(40)
    ]
    res = client.post("/segmentation/run", json={"customers": customers})
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["segments"]) >= 2
    assert sum(s["customers"] for s in body["segments"]) == 40
    for s in body["segments"]:
        assert set(s.keys()) >= {"segment", "customers", "customer_pct", "revenue_pct"}
        assert 0 <= s["customer_pct"] <= 100
        assert 0 <= s["revenue_pct"] <= 100


def test_basket_run_from_transaction_rows():
    transactions = []
    for i in range(30):
        combo = ["A", "B"] if i % 2 == 0 else ["A", "C"]
        for p in combo:
            transactions.append({"order_id": f"o{i}", "product": p})
    res = client.post("/basket/run", json={"transactions": transactions, "top_k": 5})
    assert res.status_code == 200, res.text
    body = res.json()
    assert "rules" in body
    for r in body["rules"]:
        assert set(r.keys()) >= {"antecedent", "consequent", "support", "confidence", "lift"}


def test_churn_run_rule_based_summary():
    customers = [
        {"customer_id": f"c{i}", "recency": 5 * i, "frequency": 3, "monetary": 50000, "tenure": 200}
        for i in range(20)
    ]
    res = client.post("/churn/run", json={"customers": customers, "top_k": 10})
    assert res.status_code == 200, res.text
    body = res.json()
    assert sum(body["summary"].values()) == 20
    assert len(body["high_risk_customers"]) <= 10
    for c in body["high_risk_customers"]:
        assert set(c.keys()) >= {"customer_id", "churn_probability", "risk_level"}
        assert 0 <= c["churn_probability"] <= 1
        assert c["risk_level"] in {"Low", "Medium", "High"}
    # jujur: bukan model global, ini heuristik per toko
    assert body["metadata"]["model"] == "rule_based_recency"
