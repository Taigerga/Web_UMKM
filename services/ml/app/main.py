# app/main.py
"""FastAPI ML service - 5 models, inference only against persisted artifacts."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "services" / "ml") not in sys.path:
    sys.path.insert(0, str(ROOT / "services" / "ml"))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any, Optional

from app.inference.runner import InferenceRunner
from app.inference.per_store import (
    run_anomaly,
    run_basket,
    run_churn,
    run_forecast,
    run_segmentation,
)

app = FastAPI(title="BisnisInsight ML Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class HorizonInput(BaseModel):
    horizon_days: int = Field(default=30, ge=1, le=90)


# --- Schemas per-toko (Promt §13.2): NestJS mengirim data toko, bukan id. ---


class SeriesPoint(BaseModel):
    date: str
    sales: float = Field(ge=0)


class ForecastRunInput(BaseModel):
    series: list[SeriesPoint]
    horizon_days: int = Field(default=30, ge=1, le=90)


class CustomerRfmPoint(BaseModel):
    customer_id: str
    recency: float = Field(ge=0)
    frequency: float = Field(ge=0)
    monetary: float = Field(ge=0)


class ChurnRunInput(BaseModel):
    customers: list[CustomerRfmPoint]
    top_k: int = Field(default=50, ge=1, le=200)


class SegmentationRunInput(BaseModel):
    customers: list[dict[str, Any]]


class TransactionRow(BaseModel):
    order_id: str
    product: str


class BasketRunInput(BaseModel):
    transactions: list[TransactionRow]
    top_k: int = Field(default=20, ge=1, le=100)


class AnomalyRunInput(BaseModel):
    series: list[SeriesPoint]


runner = InferenceRunner()


@app.get("/health")
def health():
    return {"status": "ok", "models": runner.status()}


@app.post("/train")
def train():
    from training.train_all import main as _train
    try:
        _train()
        runner.reload()
        return {"status": "trained", "models": runner.status()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/forecast")
def forecast(inp: HorizonInput = HorizonInput()):
    try:
        return runner.forecast(inp.horizon_days)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/segmentation")
def segmentation():
    try:
        return runner.segmentation()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/basket")
def basket(top_k: int = 20):
    try:
        return runner.basket(top_k)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/churn")
def churn(top_k: int = 50):
    try:
        return runner.churn(top_k)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/anomaly")
def anomaly():
    try:
        return runner.anomaly()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Inferensi per-toko: data dikirim di payload, artefak global tidak dipakai.
# Data tidak layak => 400 dengan pesan jelas, bukan hasil dikarang.
# ---------------------------------------------------------------------------


def _run_guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/forecast/run")
def forecast_run(inp: ForecastRunInput):
    return _run_guard(run_forecast, [p.model_dump() for p in inp.series], inp.horizon_days)


@app.post("/segmentation/run")
def segmentation_run(inp: SegmentationRunInput):
    return _run_guard(run_segmentation, list(inp.customers))


@app.post("/basket/run")
def basket_run(inp: BasketRunInput):
    return _run_guard(run_basket, [p.model_dump() for p in inp.transactions], inp.top_k)


@app.post("/churn/run")
def churn_run(inp: ChurnRunInput):
    return _run_guard(run_churn, [c.model_dump() for c in inp.customers], inp.top_k)


@app.post("/anomaly/run")
def anomaly_run(inp: AnomalyRunInput):
    return _run_guard(run_anomaly, [p.model_dump() for p in inp.series])
