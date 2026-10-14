# app/preprocessing/loader.py
"""Shared data loader used by training AND inference (one source, no drift)."""
import pandas as pd
from pathlib import Path

from app.core.config import settings


def load_raw(data_dir: str = None):
    data_dir = Path(data_dir or settings.DATA_DIR)
    main = pd.read_csv(data_dir / "ecommerce_sales_customer_analytics_150k.csv", low_memory=False)
    items = pd.read_csv(data_dir / "order_items.csv", low_memory=False)
    cust = pd.read_csv(data_dir / "customer_master.csv")
    prod = pd.read_csv(data_dir / "product_catalog.csv")
    return main, items, cust, prod


def attach_customer(items_df, main_df):
    """Recover customer_id for order_items rows via order_id join (no drift)."""
    m = main_df[["order_id", "customer_id"]].drop_duplicates("order_id")
    out = items_df.merge(m, on="order_id", how="left", validate="many_to_one")
    return out


def parse_dates(df):
    df = df.copy()
    df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
    return df


def daily_sales(df):
    """Daily revenue/order aggregates per date (single customer universe; tenant isolation enforced upstream)."""
    df = parse_dates(df)
    agg = (
        df.assign(_date=df["order_date"].dt.normalize())
        .groupby("_date")
        .agg(sales=("net_sales", "sum"), orders=("order_id", "nunique"), qty=("quantity", "sum"))
        .reset_index()
        .rename(columns={"_date": "date"})
        .sort_values("date")
        .reset_index(drop=True)
    )
    agg["date"] = pd.to_datetime(agg["date"])
    return agg


def rfm_table(df, reference_date=None):
    """Compute Recency/Frequency/Monetary per customer. reference_date = cutoff (last observed + 1 day)."""
    df = parse_dates(df)
    if reference_date is None:
        reference_date = df["order_date"].max() + pd.Timedelta(days=1)
    reference_date = pd.Timestamp(reference_date)
    g = df.groupby("customer_id").agg(
        last=("order_date", "max"),
        frequency=("order_id", "nunique"),
        monetary=("net_sales", "sum"),
        first=("order_date", "min"),
    ).reset_index()
    g["recency"] = (reference_date - g["last"]).dt.days
    g["tenure"] = (reference_date - g["first"]).dt.days
    g["avg_order_value"] = g["monetary"] / g["frequency"]
    return g.dropna()


def churn_label(df, reference_date, horizon_days=90):
    """churn = no purchase in last horizon_days relative to reference_date."""
    last = df.groupby("customer_id")["order_date"].max()
    cutoff = pd.Timestamp(reference_date) - pd.Timedelta(days=horizon_days)
    labels = (last < cutoff).astype(int)
    return labels


def transaction_itemsets(df, main_df):
    """Build per-order set of product_ids (joined via order_id)."""
    j = attach_customer(df if "customer_id" not in df.columns else df, main_df)
    # items df already has product_id
    grp = df.groupby("order_id")["product_id"].apply(list).reset_index()
    return grp
