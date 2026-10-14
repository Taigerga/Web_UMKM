# app/models/basket.py
"""Market Basket: FP-Growth association rules (mlxtend)."""
import json
from pathlib import Path
import joblib
import pandas as pd
from mlxtend.frequent_patterns import fpgrowth, association_rules
from mlxtend.preprocessing import TransactionEncoder

from app.core import config as cfg
from app.preprocessing.loader import transaction_itemsets


class BasketModel:
    def __init__(self, artifacts_dir=None, min_support=0.00005, min_confidence=0.01, min_lift=1.0):
        self.artifacts_dir = Path(artifacts_dir or cfg.settings.ARTIFACTS_DIR) / "market_basket/v1"
        self.min_support = min_support
        self.min_confidence = min_confidence
        self.min_lift = min_lift
        self.frequent = None
        self.rules = None
        self.metrics = {}

    def train(self, df, main_df):
        grp = transaction_itemsets(df, main_df)
        transactions = grp["product_id"].tolist()
        te = TransactionEncoder()
        te_ary = te.fit(transactions).transform(transactions)
        pdf = pd.DataFrame(te_ary, columns=te.columns_)
        self.frequent = fpgrowth(pdf, min_support=self.min_support, use_colnames=True)
        if len(self.frequent):
            r = association_rules(self.frequent, metric="lift", min_threshold=self.min_lift)
            r = r[r["confidence"] >= self.min_confidence].sort_values("lift", ascending=False)
            r["antecedents"] = r["antecedents"].apply(lambda x: list(x))
            r["consequents"] = r["consequents"].apply(lambda x: list(x))
            self.rules = r
        else:
            self.rules = pd.DataFrame()
        self.metrics = {
            "n_transactions": len(transactions),
            "n_items": len(te.columns_),
            "n_rules": int(len(self.rules)),
            "min_support": self.min_support,
            "min_lift": self.min_lift,
        }
        return self.metrics

    def infer(self, top_k=20):
        if self.rules is None:
            self.load()
        if len(self.rules) == 0:
            return {"rules": [], "metadata": {"model": "fp_growth", "metrics": self.metrics}}
        r = self.rules.head(top_k)
        rules = []
        for _, row in r.iterrows():
            rules.append({
                "antecedent": row["antecedents"],
                "consequent": row["consequents"],
                "support": float(row["support"]),
                "confidence": float(row["confidence"]),
                "lift": float(row["lift"]),
                "leverage": float(row.get("leverage", 0)),
                "conviction": float(row.get("conviction", 0)),
                "transactions": int(row.get("transaction_count", len(self.rules))),
            })
        return {"rules": rules, "metadata": {"model": "fp_growth", "metrics": self.metrics}}
    def save(self):
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump({"frequent": self.frequent, "rules": self.rules, "metrics": self.metrics, "params": (self.min_support, self.min_confidence, self.min_lift)}, self.artifacts_dir / "model.pkl")
        (self.artifacts_dir / "metadata.json").write_text(json.dumps(self.metrics, indent=2, default=str))

    def load(self):
        p = self.artifacts_dir / "model.pkl"
        if not p.exists():
            raise FileNotFoundError("basket model not trained")
        obj = joblib.load(p)
        self.frequent = obj["frequent"]; self.rules = obj["rules"]
        self.metrics = obj["metrics"]
        self.min_support, self.min_confidence, self.min_lift = obj["params"]
