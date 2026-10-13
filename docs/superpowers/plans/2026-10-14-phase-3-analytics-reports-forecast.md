# Phase 3: Analytics, Reports, Forecasting, Advanced Catalog

**Tujuan:** Menambahkan dashboard analytics real-time, export laporan (PDF/Excel), forecasting penjualan dengan ML, dan catalog advanced dengan supplier/margin analysis.

**Periode:** Oct 14 - (TBD)

---

## Arsitektur Phase 3

**Stack:**
- Backend: NestJS 11, Prisma 7, MySQL analytics DB
- Frontend: Next.js 16, React, charting (Chart.js/Recharts), PDF export (pdfkit/html2pdf)
- ML: Python FastAPI sidecar untuk forecasting (Prophet/ARIMA) OR Node.js ML library
- Cache: Redis untuk aggregated metrics (sales summary, trends)

**Database:**
- Extend schema: forecast results, margin tracking, supplier links
- Views MySQL untuk aggregated metrics (daily sales, top products)

**Tenant Isolation:**
- Semua query filter by `storeId`
- Redis key namespace: `store:{storeId}:metric:*`
- Export file per store, user dapat download sendiri

---

## Task Breakdown

### Task 1: Schema Extension (Products/Suppliers/Margins)

**Files:**
- `apps/backend/prisma/migrations/20261014_*.sql`
- Modify `schema.prisma`

**Perubahan:**
- Add `ProductCategory` model: id, storeId, name, description
- Add `Supplier` model: id, storeId, name, contact, address
- Add `ProductSupplier` model: productId, supplierId, cost, leadDays
- Add `ProductMargin` model: productId, costPrice, marginPercent
- Add `DailySales` view: storeId, date, totalSales, itemCount, orderCount
- Add `ForecastResult` model: storeId, productId, date, predictedQty, confidence

**Steps:**
- [ ] Create migration
- [ ] Apply to dev DB
- [ ] Generate Prisma client

---

### Task 2: Analytics API (Metrics Aggregation)

**Files:**
- Create: `src/analytics/analytics.module.ts`
- Create: `src/analytics/analytics.service.ts`
- Create: `src/analytics/analytics.controller.ts`

**Endpoints:**
- `GET /stores/:storeId/analytics/summary` - total sales, avg order, top products (7d/30d/YTD)
- `GET /analytics/sales-trend` - daily/weekly/monthly aggregated
- `GET /analytics/top-products` - by qty, revenue, profit
- `GET /analytics/customer-segments` - by spend, frequency, retention
- `GET /analytics/inventory` - stock levels, turnover rate

**Implementation:**
- Query MySQL views + aggregation
- Cache results di Redis (TTL 1 jam)
- Return JSON dengan metadata (as of timestamp, last refresh)

**Tests:**
- [ ] Unit: aggregation logic, tenant scope
- [ ] E2E: verify cache hit/miss

---

### Task 3: Advanced Catalog (Suppliers/Categories/Margins)

**Files:**
- Modify: `src/catalog/products.service.ts` & controller
- Create: `src/catalog/categories.service.ts` & controller
- Create: `src/catalog/suppliers.service.ts` & controller
- Create: `src/catalog/margins.service.ts` & controller

**Endpoints:**
- `GET /stores/:storeId/categories` - list
- `POST /categories` - create
- `PATCH /categories/:id` - update
- `GET /products/:id/margins` - cost + margin %
- `POST /products/:id/margins` - set cost/margin
- `GET /suppliers` - list
- `POST /suppliers` - create
- `POST /products/:id/suppliers` - link supplier + cost

**Tests:**
- [ ] CRUD tenant scope
- [ ] Margin calculation

---

### Task 4: Forecasting Service

**Files:**
- Create: `src/forecast/forecast.service.ts`
- Create: `src/forecast/forecast.controller.ts`
- Create: Python script atau Node.js library wrapper

**Implementation:**
- Ingest: order items (qty) untuk last 90 hari
- Model: Prophet (trend, seasonality) atau ARIMA
- Output: predicted qty per product untuk next 30 hari + confidence interval
- Store: results di `ForecastResult` table
- Endpoint: `POST /forecast/compute` (admin only, async job)
- Endpoint: `GET /forecast/:productId` - get predictions + confidence

**Pilihan ML Stack:**
- **Option A:** Python FastAPI + Prophet (accurate, mature)
  - Pro: Industry standard
  - Con: Extra service, deployment complexity
- **Option B:** Node.js ml5.js atau simple exponential smoothing
  - Pro: Unified stack
  - Con: Less sophisticated

**Rekomendasi:** Option A (Prophet) untuk accuracy, dockerized service

**Tests:**
- [ ] Forecast generation (mock data)
- [ ] Confidence interval calculation

---

### Task 5: Frontend Analytics Dashboard

**Files:**
- Create: `apps/frontend/app/(dashboard)/dashboard/analytics/page.tsx`
- Create: `apps/frontend/components/dashboard/analytics-panel.tsx`
- Create: `apps/frontend/components/analytics/` (KPI cards, charts)

**UI Components:**
- KPI cards: Total Sales, Avg Order, Top Product, Active Customers
- Sales Trend chart: Daily line graph, selectable period (7d/30d/90d)
- Top Products: Table + small bar chart
- Customer Segments: Pie chart (high/medium/low spenders)
- Product Forecast: Line chart (actual vs predicted, confidence band)

**Rules:**
- Client Component, fetch API direct
- NO `use cache` (tenant data)
- Polling / manual refresh button (1-hour cache at API level)

**Tests:**
- [ ] Data fetch + error handling
- [ ] Chart rendering (mock data)

---

### Task 6: Reports & Export (PDF/Excel)

**Files:**
- Create: `src/reports/reports.service.ts`
- Create: `src/reports/reports.controller.ts`
- Modify: `apps/frontend/components/dashboard/reports-panel.tsx`

**Endpoints:**
- `GET /stores/:storeId/reports/sales-summary` → PDF (summary, trend, top products)
- `GET /reports/detailed` → Excel (orders, items, customers, products) - 90 day
- `GET /reports/forecast` → PDF (predictions per product, recommendations)

**Implementation:**
- PDF: use pdfkit (Node.js native)
- Excel: use `exceljs` library
- Generate on-demand, store in temp, stream to client
- Filename: `{storeName}_sales_report_{date}.pdf`

**Tests:**
- [ ] PDF generation (no empty files)
- [ ] Excel row count matches query
- [ ] File download works

---

### Task 7: Frontend Reports UI

**Files:**
- Create: `apps/frontend/app/(dashboard)/dashboard/reports/page.tsx`
- Create: `apps/frontend/components/dashboard/reports-panel.tsx`

**UI:**
- Report type selector: Sales Summary, Detailed Orders, Forecast
- Date range picker
- Download buttons (PDF/Excel where applicable)
- Recent exports list (cached locally)

**Tests:**
- [ ] Button clicks trigger downloads
- [ ] Error messages on failure

---

### Task 8: Redis Integration (Caching)

**Files:**
- Modify: `src/database/redis.service.ts` (create if not exists)
- Modify: `src/analytics/analytics.service.ts` - use cache

**Implementation:**
- Cache key: `store:{storeId}:metric:{metricType}:{period}`
- TTL: 1 hour (user can manual refresh)
- Invalidation: on commit dataset, on manual order create, nightly batch
- Redis cluster optional (single node for MVP)

**Tests:**
- [ ] Cache hit after first query
- [ ] Expiry works
- [ ] Cross-store isolation

---

### Task 9: Admin Batch Jobs (Forecast Compute)

**Files:**
- Create: `src/jobs/forecast.job.ts`
- Modify: `src/app.module.ts` - register scheduler
- Use: `@nestjs/schedule` (cron)

**Cron Job:**
- Run nightly 2 AM
- Compute forecast untuk semua active stores
- Store results di `ForecastResult`
- Log status + errors

**Tests:**
- [ ] Job runs without error
- [ ] Results persisted

---

### Task 10: Integration Tests (E2E)

**Files:**
- Create: `test/analytics.e2e.spec.ts`
- Create: `test/reports.e2e.spec.ts`
- Create: `test/forecast.e2e.spec.ts`

**Scenarios:**
- Upload dataset → commit → verify metrics update
- Request report PDF → verify file valid
- Request forecast → verify results with confidence
- Check tenant isolation (store A cannot see store B metrics)

---

## Technical Notes

### Performance
- Aggregation queries: add indexes on (storeId, date) for orders/items
- Forecast: run async via job scheduler, not on-demand blocking
- Cache: Redis for hot metrics, TTL 1h

### Security
- Report downloads: tie to authenticated user's stores only
- Forecast API: admin/owner role only
- No sensitive data in logs (PII filtering)

### MVP vs Full
- **MVP (2-3 weeks):**
  - Analytics summary + trend chart
  - Basic PDF export
  - Simple forecasting (exponential smoothing, Node.js only)
  
- **Full (4-6 weeks):**
  - All above + advanced catalog, supplier links, margin tracking
  - Prophet forecasting service
  - Detailed reports (Excel, customer segments)
  - Nightly batch jobs

---

## Rollout Strategy

1. Commit Phase 3 branch early (schema + analytics API)
2. Test analytics API standalone
3. Add frontend dashboard
4. Layer forecasting (Node.js first, then Python optional)
5. Add reports
6. Integrate caching
7. Final e2e, then merge to main

---

## Constraints

- Database: no sharding, single MySQL instance
- No user notification system (async job results via UI polling)
- Forecast accuracy depends on historical data (90d minimum)
- Redis optional (can use in-memory cache as fallback)
