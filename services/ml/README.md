# ML Service (BisnisInsight)

FastAPI service exposing 5 trained models.

## Run
```bash
cd E:\ProjekSainsData\Web_UMKM
pip install -r services/ml/requirements.txt  # or use existing Python env
python -m uvicorn app.main:app --app-dir services/ml --port 8000 --reload
```

## Train
```bash
cd E:\ProjekSainsData\Web_UMKM
python services/ml/training/train_all.py
# or POST http://127.0.0.1:8000/train
```

## Test
```bash
cd E:\ProjekSainsData\Web_UMKM\services\ml
python -m pytest
```

## Endpoints
- GET /health
- POST /train
- POST /forecast  {horizon_days}
- POST /segmentation
- POST /basket?top_k=20
- POST /churn?top_k=50
- POST /anomaly

All inference from persisted artifacts; returns explanations in plain language.
