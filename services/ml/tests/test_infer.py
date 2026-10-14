import sys
from pathlib import Path
ROOT_ART = str(Path(__file__).resolve().parents[1] / "artifacts")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.forecast import ForecastModel
from app.models.segmentation import SegmentationModel
from app.models.basket import BasketModel
from app.models.anomaly import AnomalyModel
from app.models.churn import ChurnModel

def test_forecast_infer_shape():
    m = ForecastModel(ROOT_ART); m.load()
    r = m.infer(7)
    assert len(r["forecasts"]) == 7
    assert all(set(f.keys()) == {"date","predicted","lower","upper"} for f in r["forecasts"])
    assert r["metadata"]["chosen"] == "seasonal_naive"

def test_segmentation_has_segments():
    m = SegmentationModel(ROOT_ART); m.load()
    r = m.infer()
    assert len(r["segments"]) >= 2
    assert sum(s["customers"] for s in r["segments"]) == 24911

def test_basket_rules():
    m = BasketModel(ROOT_ART); m.load()
    r = m.infer(5)
    assert len(r["rules"]) > 0

def test_anomaly_count():
    m = AnomalyModel(ROOT_ART); m.load()
    r = m.infer()
    assert r["n_total"] == 1826
    assert len(r["anomalies"]) > 0

def test_churn_summary():
    m = ChurnModel(ROOT_ART); m.load()
    r = m.infer(5)
    assert sum(r["summary"].values()) == 24911
