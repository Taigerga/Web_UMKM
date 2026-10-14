# evaluation/metrics.py
from sklearn.metrics import mean_absolute_error, mean_squared_error, precision_recall_curve, auc, f1_score, recall_score


def forecast_metrics(y_true, y_pred):
    import numpy as np
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mae = mean_absolute_error(y_true, y_pred)
    rmse = mean_squared_error(y_true, y_pred) ** 0.5
    denom = np.abs(y_true).sum() or 1.0
    wape = np.abs(y_true - y_pred).sum() / denom
    return {"mae": float(mae), "rmse": float(rmse), "wape": float(wape)}


def churn_metrics(y_true, y_pred, y_proba):
    pr, rc, _ = precision_recall_curve(y_true, y_proba)
    pr_auc = auc(rc, pr)
    return {
        "pr_auc": float(pr_auc),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "recall_high_risk": float(recall_score(y_true, y_pred, pos_label=1, zero_division=0)),
    }
