# Data Profiling & ML Feasibility Analysis

**Date:** Oct 14, 2026
**Analyzed:** 5 CSV files dari `/data/raw/`

---

## Dataset Overview

| File | Rows | Purpose |
|---|---|---|
| ecommerce_sales_customer_analytics_150k.csv | 138,117 | Main transaction table (1 row = 1 order) |
| order_items.csv | 397,570 | Line items per order (1 order = multiple items) |
| customer_master.csv | 25,001 | Customer attributes |
| product_catalog.csv | 1,176 | Product attributes |
| dataset_statistics.csv | 1 | Summary stats |

---

## Key Statistics

**From dataset_statistics.csv:**
- Total transactions: 138,116
- Total customers: 24,911
- Date range: 2021-01-01 to 2025-12-31 (5 tahun!)
- Total revenue: $177,134,263.74
- Total profit: $76,146,395.76
- Avg order value: $1,282.50
- Avg rating: 3.68/5
- Return rate: 6.85%
- Cancellation rate: 6.08%

---

## Column Inventory

### ecommerce_sales_customer_analytics_150k.csv (Main table)

**Order fields:**
- order_id, order_date, order_time, order_status

**Customer fields:**
- customer_id, customer_name, customer_age, gender, customer_segment, customer_type
- customer_city, customer_state, customer_country, region, customer_postal_code

**Financial fields:**
- quantity, gross_sales, discount_amount, tax_amount, shipping_cost, net_sales
- product_cost, profit, profit_margin_percentage

**Customer metrics:**
- customer_lifetime_value, is_repeat_customer, customer_order_count

**Operational fields:**
- sales_channel, payment_method, payment_status, currency
- shipping_method, warehouse, delivery_days, estimated_delivery_days, delivery_status

**Quality fields:**
- return_status, return_reason, customer_rating, review_sentiment, customer_review

**Marketing fields:**
- marketing_channel, campaign_name, coupon_code, loyalty_points_earned, loyalty_points_redeemed

### order_items.csv (Detail table - 397,570 rows)

- order_id, product_id, quantity, unit_price
- discount_percentage, discount_amount, gross_sales, tax_amount, shipping_cost
- net_sales, product_cost, profit

**Note:** Main table appears to be PRE-AGGREGATED (1 row per order). 
Order_items.csv has MULTIPLE rows per order (397k items vs 138k orders).
Join ratio: ~2.9 items per order on average.

### customer_master.csv (25,001 customers)

- customer_id, customer_name, customer_age, gender, customer_segment
- customer_city, customer_state, customer_country, region, customer_postal_code
- customer_acquisition_cost

### product_catalog.csv (1,176 products)

- product_id, product_name, product_category, product_subcategory
- brand, supplier, unit_price, product_cost, product_rating

---

## ML Model Feasibility Assessment

### 1️⃣ Sales Forecasting ✅ EXCELLENT

**Data availability:**
- ✓ 5 tahun data historis (2021-2025)
- ✓ 138k transactions = ~75 per hari average
- ✓ Daily, weekly, monthly aggregation possible
- ✓ Clear order_date untuk time-series

**Seasonality:**
- ✓ 5 tahun capture seasonal patterns (yearly cycles)
- ✓ Multiple years enable trend + seasonality decomposition

**Verdict:** 
- **READY FOR IMPLEMENTATION**
- Sufficient historical data for SARIMA, Prophet, atau exponential smoothing
- Confidence: HIGH
- Recommendation: Use last 90-180 days untuk validation, entire 5 years untuk training

---

### 2️⃣ Customer Segmentation (RFM) ✅ EXCELLENT

**Data availability:**
- ✓ customer_id + order_date (Recency)
- ✓ customer_order_count field (Frequency)
- ✓ customer_lifetime_value field (Monetary)
- ✓ 24,911 unique customers (good volume untuk clustering)

**RFM calculation:**
```
Recency = days since last order (from order_date)
Frequency = customer_order_count (already provided!)
Monetary = customer_lifetime_value (already provided!)
```

**Verdict:** 
- **READY FOR IMPLEMENTATION**
- Data structure ideal untuk RFM
- K-Means dapat mencari optimal k (2-8 clusters)
- Confidence: VERY HIGH
- Recommendation: Use entire dataset, cluster 24k customers

---

### 3️⃣ Market Basket Analysis ⚠️ CHALLENGING

**Data issue:**
- Main table: 1 row per ORDER (138k rows)
- Order_items: MULTIPLE rows per order (397k rows)
- Main table aggregate product data, bukan individual items

**Problem:** Market basket needs transaction grain (order) + multiple items per transaction
- Main table HIDES product diversity (aggregate quantity + sales)
- Order_items.csv punya product_id but MISSING customer_id

**Data structure mismatch:**
```
ecommerce table: order_id → customer_id, quantity, gross_sales (AGGREGATE)
order_items table: order_id → product_id, quantity (DETAIL)

Missing: order_id → customer_id link in order_items!
```

**Workaround:**
- Join order_items WITH ecommerce table on order_id
- Then: order_id + product_id pairs dapat di-mine

**Verdict:** 
- **WORKABLE but REQUIRES JOIN**
- Data available but needs preprocessing
- Confidence: MEDIUM
- Recommendation: 
  - Verify order_items.csv dapat di-join ke main table
  - Check untuk data quality issues after join
  - Test FP-Growth atau Apriori sample (10k orders first)

---

### 4️⃣ Churn Prediction ✅ GOOD

**Data availability:**
- ✓ customer_id + historical transaction dates
- ✓ is_repeat_customer flag (indicates churn status maybe?)
- ✓ customer_order_count (frequency signal)
- ✓ Time-based split possible (e.g., train on 2021-2024, test on 2025)

**Churn definition needed:**
```
Candidate definition: "No purchase in last 90 days (from reference date)"
Example: 
- Reference date: 2025-12-31
- Churn: customer last_order_date < 2025-10-02
```

**Feature engineering:**
- Days since last order
- Total purchases
- Avg days between purchases
- Total revenue
- Return rate
- Rating trend

**Verdict:** 
- **READY WITH CLARIFICATION**
- Sufficient data untuk train/test split
- Confidence: MEDIUM-HIGH
- Recommendation: 
  - Define churn clearly (e.g., 90 days no activity)
  - Use 2021-2024 untuk training, 2025 untuk validation
  - Balancing diperlukan (likely ~10-15% churn rate)

---

### 5️⃣ Anomaly Detection ✅ GOOD

**Data availability:**
- ✓ order_date + sales amount (daily aggregation possible)
- ✓ 1825 days (5 tahun) untuk detect patterns
- ✓ quantity, profit, return_status untuk multi-dimensional anomaly

**Time-series for anomaly:**
```
Daily aggregates:
- Total sales per day
- Order count per day
- Avg order value per day
- Return rate per day
```

**Verdict:** 
- **READY FOR IMPLEMENTATION**
- Sufficient historical data untuk baseline
- Confidence: HIGH
- Recommendation: 
  - Use Isolation Forest atau statistical methods
  - Rolling window (7-day MA) untuk seasonality
  - Detect lonjakan/penurunan > 2σ

---

## Data Quality Concerns

| Issue | Severity | Impact | Mitigation |
|---|---|---|---|
| Negative profit margins (sample row) | MEDIUM | Pricing data validity questionable | Investigate actual profit calc |
| Return rate 6.85% moderate | LOW | Expected in e-commerce | Include in anomaly baseline |
| order_items missing customer_id | HIGH | Basket analysis requires join | Must join with main table |
| Main table pre-aggregated | MEDIUM | Hide product diversity | Use order_items for detail |
| Synthetic-looking names | LOW | Data quality signal | Accept as demo dataset |

---

## Recommendations Before Phase 4 Implementation

### Priority 1: DATA VALIDATION
- [ ] Verify order_items.csv dapat di-join ke main table (test 100 rows)
- [ ] Validate profit margin calculations (spot check 10 rows)
- [ ] Check untuk NULL values di critical columns (order_date, customer_id, sales)

### Priority 2: DATASET SPLIT
- [ ] Designate training period: 2021-2024 (4 tahun)
- [ ] Designate validation period: 2025 (1 tahun)
- [ ] Hold test period: Oct 2026 onwards (actual production)

### Priority 3: FEASIBILITY CONFIRMATION
- [ ] Forecast: Compute daily sales aggregates, check autocorrelation
- [ ] Segmentation: Run RFM clustering, visualize segments
- [ ] Basket: Test join + sample FP-Growth (1000 orders)
- [ ] Churn: Define churn operationally, compute label distribution
- [ ] Anomaly: Compute daily metrics, identify obvious spikes/dips

### Priority 4: SCOPE DECISION
Based on findings, decide Phase 4 model priorities:
- **Must have:** Forecast + Segmentation (strongest data)
- **Should have:** Churn + Anomaly (good data, medium complexity)
- **Nice to have:** Market Basket (requires preprocessing, lower ROI)

---

## Current Data State

**✅ Ready to use:**
- Forecast (time-series complete)
- Segmentation (RFM fields present)
- Churn (historical data, needs definition)
- Anomaly (daily aggregation possible)

**⚠️ Needs preprocessing:**
- Market Basket (join order_items to main table)

**❌ Not applicable:**
- None - all 5 models potentially feasible

---

## Next Steps

1. **Data validation checklist** (above) - take ~2 hours
2. **Confirm model feasibility** dengan actual data exploration
3. **Adjust Phase 4 scope** based on data quality findings
4. **Proceed to implementation** once data gates pass

**Proceed to Phase 4 implementation setelah checklist selesai?**
