# Data Validation Report (Phase 4)

_Source: `data\raw`_

## 1) Join Verification (order_items ↔ main)
- Distinct orders in main: **138116**
- Distinct orders in items: **138116**
- Common orders (joinable): **138116** (100.0% of items orders)
- Rows per order (items): **2.88 average**
- Join result rows (joinable): **397569**
- customer_id recovered via join: **397569/397569** (100.0%)
- Basket analysis joinable: **YES**

## 2) Null Check on Critical Columns
- `order_id`: null=0 (0.00%)
- `order_date`: null=0 (0.00%)
- `customer_id`: null=0 (0.00%)
- `net_sales`: null=0 (0.00%)
- `profit`: null=0 (0.00%)
- `quantity`: null=0 (0.00%)

customer_master nulls:
  - customer_id: null=0
  - customer_segment: null=0
  - customer_city: null=0
  - customer_acquisition_cost: null=0
- order_items.order_id: null=0
- order_items.product_id: null=0
- order_items.quantity: null=0
- order_items.net_sales: null=0
- order_items.profit: null=0

## 3) Profit Calculation Sanity Check
- Sample size: 10, matches model calc: 0/10
- Verdict: profit is pre-aggregated; profit_margin_percentage = profit/net_sales*100 (matches, diff p99 ~ 0). Use provided profit directly; do not recompute from gross_sales - product_cost.

## 4) Dataset Split (train 2021-2024, test 2025)
- Date range: 2021-01-01 → 2025-12-31
- Total orders: 138116
- Train (≤2024): 110518 rows (80.0%)
- Test (2025): 27598 rows (20.0%)
- Distinct customers in test who also train: 16513

## 5) Per-Model Feasibility Matrix
| Model | Algorithm chosen | Feasible |
|---|---|---|
| Sales Forecasting | SARIMA/Prophet/seasonal-naive | YES |
| RFM Segmentation | RFM + K-Means | YES |
| Market Basket | FP-Growth mlxtend | YES |
| Churn Prediction | XGBoost/RF + churn=90d no-purchase | YES |
| Sales Anomaly | Isolation Forest + robust z-score | YES |

Notes:
- Churn label definition: churn = no purchase within last 90 days from reference date
- Min data required check: train rows (>500) and date coverage (>100)

## 6) Gate Summary
- All 5 models feasible: **YES**
- Recommended priority: Forecast + Segmentation (strong data), Churn + Anomaly (good data), Basket (join required)
