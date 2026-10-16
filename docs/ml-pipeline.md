# ML Pipeline

1. Upload dataset (CSV) -> mapping -> commit.
2. Data validation gate: kualitas data, null, join basket, split train/test.
3. Train 5 artifak model pada `services/ml`.
4. Backend queue job (`ml_jobs`) -> worker calling FastAPI ML service.
5. Endpoint status + hasil + explanation.
6. Invalidasi cache store setelah job completed.

Model: forecasting, segmentation, market basket, churn, anomaly.
SARIMA-safe seasonal naive fallback; RFM+KMeans; FP-Growth adjusted thresholds; RF/XGBoost; Isolation Forest + z robust.
