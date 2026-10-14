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
from typing import Optional

from app.inference.runner import InferenceRunner

app = FastAPI(title="BisnisInsight ML Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class HorizonInput(BaseModel):
    horizon_days: int = Field(default=30, ge=1, le=90)


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
