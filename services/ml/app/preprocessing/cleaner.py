# app/preprocessing/cleaner.py
"""Light cleanup: null drop, type coercing, negative guard."""
import numpy as np
import pandas as pd


def clean_orders(df):
    df = df.copy()
    df["net_sales"] = pd.to_numeric(df["net_sales"], errors="coerce")
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce")
    df["profit"] = pd.to_numeric(df["profit"], errors="coerce")
    df = df[df["net_sales"].notna()]
    df = df[df["net_sales"] >= 0]
    return df.reset_index(drop=True)
