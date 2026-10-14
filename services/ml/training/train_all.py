# training/train_all.py
"""Train all 5 ML models on the raw dataset and persist artifacts."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.preprocessing.loader import load_raw
from app.models.forecast import ForecastModel
from app.models.segmentation import SegmentationModel
from app.models.basket import BasketModel
from app.models.churn import ChurnModel
from app.models.anomaly import AnomalyModel

DATA_DIR = Path("data/raw")


def main():
    main_df, items_df, cust_df, prod_df = load_raw(str(DATA_DIR))
    from app.preprocessing.cleaner import clean_orders
    main_df = clean_orders(main_df)

    print("== Forecast ==")
    fm = ForecastModel(); fm.train(main_df); fm.save()
    print(json.dumps(fm.metrics, indent=2, default=str))

    print("== Segmentation ==")
    sm = SegmentationModel(); sm.train(main_df); sm.save()
    print(json.dumps(sm.metrics, indent=2, default=str))

    print("== Basket ==")
    bm = BasketModel(); bm.train(items_df, main_df); bm.save()
    print(json.dumps(bm.metrics, indent=2, default=str))

    print("== Churn ==")
    cm = ChurnModel(); cm.train(main_df); cm.save()
    print(json.dumps(cm.metrics, indent=2, default=str))

    print("== Anomaly ==")
    am = AnomalyModel(); am.train(main_df); am.save()
    print(json.dumps(am.metrics, indent=2, default=str))

    print("ALL MODELS TRAINED")


if __name__ == "__main__":
    main()
