# Phase 3: Analytics, Reports, Forecasting, Advanced Catalog — Design Spec

**Date:** Oct 14, 2026
**Version:** 1.0
**Status:** Design (Implementation in progress)

---

## Overview

Phase 3 menambahkan business intelligence layer ke BisnisInsight. Toko dapat:
- Melihat real-time sales dashboard (KPI, trends, top products)
- Menganalisis customer segments dan inventory turnover
- Export laporan PDF/Excel untuk presentasi/analisis
- Forecast penjualan next 30 hari berdasarkan historical data
- Manage supplier links, cost prices, dan margin analysis

**Target:** MVP dalam 2-3 minggu (analytics + basic forecast), full feature 4-6 minggu.

---

## Architecture

### Backend Stack
- **Framework:** NestJS 11, Prisma 7
- **Database:** MySQL 8 (analytics DB) + Views untuk aggregated metrics
- **Cache:** Redis untuk KPI cache (TTL 1h)
- **ML:** Node.js exponential smoothing (MVP) OR Python FastAPI + Prophet (full)
- **Scheduler:** @nestjs/schedule (cron jobs untuk forecast compute)

### Frontend Stack
- **Framework:** Next.js 16, React
- **Charts:** Recharts atau Chart.js
- **Export:** pdfkit (Node.js) untuk PDF, exceljs untuk Excel
- **Rules:** NO `use cache` pada tenant data (R-7), client-side API fetch only

### Data Flow
```
Orders/Items (DB) 
  ↓
Analytics Service (aggregation, calculation)
  ↓
Redis Cache (1h TTL)
  ↓
API Response → Frontend Dashboard
  ↓
Export Service (PDF/Excel generation)
```

---

## Database Schema Additions

### New Tables

#### `product_categories`
```sql
CREATE TABLE product_categories (
  id CHAR(36) PRIMARY KEY,
  store_id CHAR(36) NOT NULL,
  name VARCHAR(127) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_store_name (store_id, name),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);
```

#### `suppliers`
```sql
CREATE TABLE suppliers (
  id CHAR(36) PRIMARY KEY,
  store_id CHAR(36) NOT NULL,
  name VARCHAR(191) NOT NULL,
  contact VARCHAR(127),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_store_name (store_id, name),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);
```

#### `product_suppliers`
```sql
CREATE TABLE product_suppliers (
  id CHAR(36) PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NOT NULL,
  cost_price DECIMAL(14, 2) NOT NULL,
  lead_days INT DEFAULT 7,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_product_supplier (product_id, supplier_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);
```

#### `product_margins`
```sql
CREATE TABLE product_margins (
  id CHAR(36) PRIMARY KEY,
  product_id CHAR(36) NOT NULL UNIQUE,
  cost_price DECIMAL(14, 2) NOT NULL,
  margin_percent DECIMAL(5, 2) NOT NULL,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

#### `forecast_results`
```sql
CREATE TABLE forecast_results (
  id CHAR(36) PRIMARY KEY,
  store_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  forecast_date DATE NOT NULL,
  predicted_qty DECIMAL(14, 4) NOT NULL,
  confidence DECIMAL(5, 2) DEFAULT 0.95,
  lower_bound DECIMAL(14, 4),
  upper_bound DECIMAL(14, 4),
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_product_date (product_id, forecast_date),
  INDEX idx_store_date (store_id, forecast_date),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

---

## API Specification

### Analytics Endpoints

#### GET `/stores/:storeId/analytics/summary`
**Description:** Ringkasan penjualan untuk periode tertentu.

**Query Parameters:**
- `period`: "7d" | "30d" | "ytd" (default: "30d")

**Response:**
```json
{
  "data": {
    "totalSales": 5000000,
    "totalOrders": 120,
    "totalItems": 450,
    "avgOrderValue": 41666.67,
    "avgItemsPerOrder": 3.75,
    "period": "30d"
  }
}
```

**Auth:** `@StoreAccess()` (any authenticated member)

---

#### GET `/stores/:storeId/analytics/trend`
**Description:** Tren penjualan harian.

**Query Parameters:**
- `period`: "7d" | "30d" | "90d" (default: "30d")

**Response:**
```json
{
  "data": [
    {
      "date": "2026-09-15",
      "sales": 250000,
      "orderCount": 5,
      "itemCount": 20
    },
    {
      "date": "2026-09-16",
      "sales": 180000,
      "orderCount": 3,
      "itemCount": 12
    }
  ]
}
```

---

#### GET `/stores/:storeId/analytics/top-products`
**Description:** Produk dengan penjualan tertinggi.

**Query Parameters:**
- `limit`: integer (default: 10, max: 50)

**Response:**
```json
{
  "data": [
    {
      "productId": "uuid",
      "sku": "SKU-001",
      "name": "Teh Botol",
      "totalQty": 500,
      "totalRevenue": 1500000,
      "orderCount": 75
    }
  ]
}
```

---

#### GET `/stores/:storeId/analytics/customer-segments`
**Description:** Segmentasi pelanggan berdasarkan pola belanja.

**Response:**
```json
{
  "data": [
    {
      "segment": "high-value",
      "customerCount": 5,
      "totalSpent": 5000000,
      "avgSpent": 1000000
    },
    {
      "segment": "regular",
      "customerCount": 30,
      "totalSpent": 8000000,
      "avgSpent": 266666.67
    }
  ]
}
```

---

#### GET `/stores/:storeId/analytics/inventory`
**Description:** Status inventory dan turnover rate (last 90 days).

**Response:**
```json
{
  "data": [
    {
      "productId": "uuid",
      "sku": "SKU-001",
      "name": "Teh Botol",
      "totalQtySold90d": 500,
      "orderCount90d": 75,
      "turnoverRate": 5.56,
      "marginPercent": 25.5
    }
  ]
}
```

---

### Advanced Catalog Endpoints

#### GET `/stores/:storeId/products/:productId/margins`
**Description:** Lihat cost price dan margin % produk.

**Response:**
```json
{
  "data": {
    "productId": "uuid",
    "costPrice": 2000,
    "marginPercent": 25,
    "sellPrice": 2667
  }
}
```

---

#### PATCH `/stores/:storeId/products/:productId/margins`
**Description:** Update cost price dan margin.

**Body:**
```json
{
  "costPrice": 2000,
  "marginPercent": 25
}
```

**Auth:** `@Roles(OWNER, ADMIN)`

---

#### GET `/stores/:storeId/suppliers`
**Description:** Daftar supplier.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Supplier A",
      "contact": "021-1234567",
      "address": "Jakarta"
    }
  ]
}
```

---

#### POST `/stores/:storeId/products/:productId/suppliers`
**Description:** Link supplier ke produk dengan cost price.

**Body:**
```json
{
  "supplierId": "uuid",
  "costPrice": 2000,
  "leadDays": 7
}
```

**Auth:** `@Roles(OWNER, ADMIN)`

---

### Forecasting Endpoints

#### POST `/stores/:storeId/forecast/compute`
**Description:** Compute forecast untuk semua produk toko (async job).

**Auth:** `@Roles(OWNER, ADMIN)`

**Response:**
```json
{
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "message": "Forecast computation started"
  }
}
```

---

#### GET `/stores/:storeId/forecast/:productId`
**Description:** Lihat forecast untuk produk (next 30 days).

**Response:**
```json
{
  "data": {
    "productId": "uuid",
    "productName": "Teh Botol",
    "forecasts": [
      {
        "date": "2026-10-15",
        "predictedQty": 45.5,
        "confidence": 0.95,
        "lowerBound": 40.2,
        "upperBound": 50.8
      }
    ]
  }
}
```

---

### Reports Endpoints

#### GET `/stores/:storeId/reports/sales-summary`
**Description:** Export PDF laporan ringkasan penjualan.

**Query Parameters:**
- `period`: "7d" | "30d" | "90d" (default: "30d")
- `includeChart`: boolean (default: true)

**Response:** PDF file (binary), Content-Type: `application/pdf`

**Filename:** `{storeName}_sales_report_{date}.pdf`

---

#### GET `/stores/:storeId/reports/detailed`
**Description:** Export Excel detail orders + items (90 days).

**Response:** Excel file (binary), Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Filename:** `{storeName}_detailed_report_{date}.xlsx`

**Columns:**
- Order ID, Order Date, Customer Code, Channel, Total
- Item SKU, Item Name, Qty, Unit Price, Subtotal

---

#### GET `/stores/:storeId/reports/forecast`
**Description:** Export PDF forecast dengan confidence intervals.

**Response:** PDF file

---

## Frontend Pages

### `/dashboard/analytics`
**Component:** `AnalyticsPage`

**Sections:**
1. **KPI Cards (top row)**
   - Total Sales (30d)
   - Total Orders (30d)
   - Avg Order Value
   - Active Customers

2. **Sales Trend Chart (line)**
   - Period selector: 7d/30d/90d
   - X: date, Y: sales + item count (dual axis)

3. **Top Products Table**
   - SKU, Name, Qty Sold, Revenue
   - Sortable by revenue/qty

4. **Customer Segments Pie Chart**
   - Segments: high-value, regular, low-value
   - Hover: customer count, total spent

5. **Inventory Status Table**
   - Product, Qty Sold 90d, Turnover Rate, Margin %

**Implementation Rules:**
- Client Component (`"use client"`)
- Fetch API: `/analytics/summary?period=30d`, etc.
- NO `use cache` (R-7)
- Polling / manual refresh button
- Error boundary + loading state

---

### `/dashboard/catalog`
**Extend existing CatalogPanel with:**

**New Tabs:**
1. **Products** (existing) + Margin column
2. **Suppliers** (new)
   - List suppliers
   - Create supplier form
   - Link to products

3. **Categories** (new)
   - List categories
   - Create/update/delete

**Margin UI:**
- Each product row: click to edit cost price + margin %
- Modal form: costPrice (decimal), marginPercent (%)
- Calculate & display sell price = cost / (1 - margin%)

---

### `/dashboard/reports`
**Component:** `ReportsPanel`

**UI:**
- Report type selector: Sales Summary | Detailed | Forecast
- Date range picker (date range or preset: 7d/30d/90d)
- Preview toggle (show data before download)
- Download buttons: PDF / Excel (where applicable)
- Recent exports list (localStorage cache)

**Implementation:**
- Client-side form
- POST/GET to `/reports/{type}` endpoint
- Stream binary response to browser download
- Show progress bar during generation

---

### `/dashboard/forecast` (optional, Phase 3.2)
**Component:** `ForecastPanel`

**UI:**
- Product selector (dropdown)
- Chart: line (historical last 30d + predicted next 30d)
- Confidence band (upper/lower bounds)
- Table: forecast by date + confidence %
- Recommendations: "Stock up" / "Watch inventory" based on forecast

---

## Caching Strategy

### Redis Keys
```
store:{storeId}:metric:summary:{period}      → SalesSummary (TTL: 1h)
store:{storeId}:metric:trend:{period}        → SalesTrend[] (TTL: 1h)
store:{storeId}:metric:top-products:{limit}  → TopProduct[] (TTL: 1h)
store:{storeId}:metric:segments              → CustomerSegment[] (TTL: 1h)
store:{storeId}:metric:inventory             → Inventory[] (TTL: 1h)
```

### Invalidation
- **On dataset commit:** Invalidate all `store:{storeId}:metric:*`
- **On manual order create:** Invalidate summary, trend, top-products
- **On product margin update:** Invalidate inventory + margins
- **Nightly batch (2 AM):** Recompute forecasts, clear old results

### Fallback
- Redis unavailable → Query DB directly (slow but safe)
- Cache miss → Query + populate → Return

---

## Forecasting Model

### MVP (Phase 3.1)
**Method:** Exponential Smoothing (Node.js)
- Input: qty sold last 90 days (daily aggregation)
- Output: predicted qty for next 30 days
- Confidence: fixed 0.95

**Pros:**
- Fast, no external service
- Good for stable trends

**Cons:**
- Limited seasonality detection
- No confidence interval calculation

---

### Full (Phase 3.2+)
**Method:** Prophet (Python FastAPI)
- Input: daily qty, external regressors (promotions, holidays)
- Output: predicted qty + confidence intervals
- Seasonality: yearly/weekly/daily

**Deployment:**
- Separate Docker service on port 5000
- NestJS calls via HTTP
- Async job runner (Bull queue)
- Results persisted in `forecast_results` table

**Integration:**
```
NestJS Job Queue
  ↓ (POST /forecast/compute)
Python FastAPI Prophet Service
  ↓ (returns predictions)
Store in forecast_results
  ↓ (cache invalidate)
Frontend query `/forecast/:productId`
```

---

## Security & Compliance

### Tenant Isolation
- All queries: `WHERE storeId = ?`
- Redis key namespace: `store:{storeId}:*`
- Export download: tied to authenticated user's stores
- Report generation: no cross-store data leakage

### Data Privacy
- No PII in PDF/Excel (customer names optional, codes only)
- Forecast data: only accessible to store members
- No audit logging of report downloads (too noisy)

### Performance
- Pagination on `/analytics/top-products` (max 50)
- Aggregation queries: add indexes on (storeId, orderDate)
- Forecast compute: max 10 min, timeout + log
- PDF generation: stream response, no temp files

---

## Error Handling

### API Errors

| Code | Scenario | Message |
|------|----------|---------|
| 400 | Invalid period param | "Period harus '7d', '30d', '90d'" |
| 404 | Forecast not computed | "Forecast belum tersedia, jalankan compute terlebih dahulu" |
| 401 | Unauthorized | "Not authenticated" |
| 403 | Store access denied | "Access denied untuk toko ini" |
| 500 | Report generation failed | "Gagal generate laporan, coba lagi" |

### Frontend Error Handling
- Try/catch on fetch
- Show toast error message
- Retry button for transient failures
- Fallback: empty state dengan "No data available"

---

## Metrics & Monitoring

### Key Metrics
- Analytics API response time (target: <500ms)
- Forecast compute duration (target: <5 min per store)
- Cache hit rate (target: >80%)
- Report generation time (target: <10s for PDF, <3s for Excel)

### Logging
- API requests: method, endpoint, storeId, duration, status
- Forecast jobs: storeId, product count, status, duration
- Errors: stack trace, context (storeId, userId)

---

## Rollout Plan

1. **Week 1:** Schema + Analytics API (Task 1-2)
2. **Week 1-2:** Advanced Catalog + Suppliers (Task 3)
3. **Week 2:** Basic Forecasting (Node.js) (Task 4)
4. **Week 2-3:** Frontend Dashboard + Reports (Task 5-7)
5. **Week 3:** Redis Integration + Batch Jobs (Task 8-9)
6. **Week 3+:** Full Forecasting (Prophet) + E2E tests (Phase 3.2)

**MVP Merge:** End of week 2
**Full Feature Merge:** End of week 3

---

## Constraints & Assumptions

- Historical data minimum: 90 days for accurate forecast
- Forecast accuracy: ±20% (exponential smoothing)
- Redis optional (fallback to DB queries)
- Single MySQL instance (no sharding)
- No real-time streaming (polling-based)
- User notifications: via UI polling, no push notifications
