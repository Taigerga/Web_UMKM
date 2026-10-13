# Phase 4: Integrasi ML + Dashboard — Implementation Plan

**Date:** Oct 14, 2026
**Status:** Planning → Implementation
**Duration:** 1-2 minggu (MVP async job management + advanced analytics)

---

## Objective

Mengintegrasikan hasil ML ke dalam dashboard dengan job management asynchronous, locking mechanism, idempotency, recovery, dan penjelasan hasil dalam bahasa awam.

**MVP Gate:** Klik "Jalankan Analisis" → job diterima (202) → polling status → hasil muncul. Tidak ada angka mock.

---

## Task Breakdown

### Task 1 — Backend Job Management (async + locking)

**Files:**
- Modify: `src/analytics/analytics.controller.ts` — return 202 + jobId
- Modify: `src/analytics/analytics.service.ts` — async wrapper
- Create: `src/jobs/ml-job.entity.ts` — job table schema (if not exists)
- Create: `src/jobs/ml-job.service.ts` — job CRUD, idempotency, recovery
- Create: `src/jobs/ml-worker.service.ts` — worker with SELECT...FOR UPDATE
- Modify: `src/app.module.ts` — register worker if needed

**Interfaces:**
- `POST /analytics/:jobId/run` → response `{ jobId, status: "queued" }`
- `GET /analytics/jobs/:jobId` → response `{ jobId, status, progress, result }`
- Worker polling jobs with `storeId, status="queued"`, acquire lock, execute, update status

**Implementation Steps:**
- [ ] Extend schema: add `ml_jobs` table (id, storeId, type, status, input_params, result, idempotency_key, createdAt)
- [ ] Implement job service with upsert logic (idempotency via key)
- [ ] Implement worker: SELECT...FOR UPDATE, execute ML, SET status="completed"
- [ ] Implement recovery: jobs `status="running"` > 10 min → status="failed"
- [ ] Add timeout + retry logic to Python calls
- [ ] Tests: idempotency, concurrent job handling, recovery

**Tests:**
- [ ] Unit: idempotency key prevents duplicate job creation
- [ ] Unit: worker acquires lock correctly
- [ ] Unit: recovery job marked failed after timeout
- [ ] E2E: submit job → polling loop → result retrieved

---

### Task 2 — Advanced Analytics Queries (margin, profit, category)

**Files:**
- Modify: `src/analytics/analytics.service.ts` — add new query methods
- Create: `src/analytics/analytics.queries.ts` — complex SQL if needed

**New Endpoints:**
- `GET /analytics/profitability` — margin & profit by product/category
- `GET /analytics/category-breakdown` — sales per category
- `GET /analytics/product-performance` — detailed per-product metrics
- `GET /analytics/customer-value` — RFM + lifetime value

**Implementation:**
- [ ] Query margin: cost_price, selling_price, margin%
- [ ] Query profit: (selling_price - cost_price) × qty per product
- [ ] Query category breakdown: sum by product.category
- [ ] Cache these queries (1h TTL)
- [ ] Tests: verify calculations, tenant isolation

---

### Task 3 — Frontend Job Submission & Monitoring

**Files:**
- Create: `apps/frontend/components/dashboard/analytics-job-panel.tsx`
- Create: `apps/frontend/app/(dashboard)/dashboard/analytics-jobs/page.tsx` (optional)
- Modify: `apps/frontend/components/dashboard/analytics-panel.tsx` — add job submission UI

**UI Components:**
- Analysis type selector
- Parameter input form
- Submit button (POST to /analytics/:jobId/run)
- Job status polling (GET /jobs/:jobId every 2s)
- Progress bar & status display
- Results display when `status="completed"`
- Error handling for `status="failed"`

**Implementation:**
- [ ] Create job submission form
- [ ] Implement polling logic with React hooks
- [ ] Display status: queued → running → completed/failed
- [ ] Show result when ready
- [ ] Cancel job button (optional)
- [ ] Tests: form submission, polling, result display

---

### Task 4 — Penjelasan Hasil (Bahasa Awam)

**Files:**
- Create: `src/analytics/analytics-explanations.service.ts` — template responses
- Modify: analytics controller — attach explanation to response

**Implementation:**
- [ ] Create explanation template untuk setiap analisis type
- [ ] Generate penjelasan berdasarkan hasil actual (tidak template kosong)
- [ ] Contoh: "Segmen Pelanggan Setia berisi {count} pelanggan dan menyumbang {pct}% omzet pada periode {startDate} - {endDate}."
- [ ] Include period, confidence, limitations dalam response
- [ ] Tests: verify template rendering dengan data

---

### Task 5 — Admin ML Monitoring Dashboard

**Files:**
- Create: `apps/frontend/app/(dashboard)/dashboard/admin/ml-status/page.tsx`
- Create: `src/admin/ml-monitoring.controller.ts`
- Create: `src/admin/ml-monitoring.service.ts`

**Endpoints:**
- `GET /admin/ml-jobs` — list all jobs dengan status, duration, error
- `GET /admin/ml-models` — list model versions, last training, metrics
- `GET /admin/ml-jobs/:jobId/logs` — job execution log

**UI:**
- [ ] Job queue status (queued, running, completed, failed counts)
- [ ] Recent jobs table (timestamp, store, type, status, duration)
- [ ] Model versions & health
- [ ] Performance metrics (avg duration, success rate)
- [ ] Tests: auth (admin only), data display

---

### Task 6 — Advanced Charting (RFM, Confidence Bands, Anomaly Markers)

**Files:**
- Modify: `apps/frontend/components/dashboard/analytics-panel.tsx` — add chart types
- Install: Recharts enhancements if needed

**Charts:**
- [ ] RFM scatter: X=Recency, Y=Frequency, bubble=Monetary, color=Segment
- [ ] Forecast with confidence bands: line + upper/lower bound shading
- [ ] Anomaly detection: line chart + red marker for anomalies
- [ ] Churn risk: bar chart color-coded by risk level
- [ ] Tests: chart rendering, hover tooltips, responsiveness

---

### Task 7 — E2E Testing (15-step gate)

**Files:**
- Create: `test/phase4-e2e.spec.ts` — comprehensive E2E test

**Scenario (15 steps):**
1. Admin login
2. Open admin ML monitoring
3. Verify model versions listed
4. Owner login
5. Open analytics dashboard
6. Select analysis type (forecast)
7. Set parameters (period, store)
8. Click "Jalankan Analisis"
9. Receive 202 response with jobId
10. Poll job status (should be queued)
11. Wait for job status → running
12. Wait for job status → completed
13. Fetch results via GET /jobs/:jobId
14. Verify results displayed in dashboard
15. Verify penjelasan hasil dalam bahasa awam

**Implementation:**
- [ ] Setup Cypress or similar for E2E
- [ ] Implement 15-step test scenario
- [ ] Add assertions for each step
- [ ] Verify no mock data in final result
- [ ] Run test before merge

---

### Task 8 — Integration Tests & Verification

**Files:**
- Modify: `test/analytics.e2e.spec.ts` — add async job tests
- Add: tests untuk idempotency, recovery, locking

**Tests:**
- [ ] Job idempotency: same key → same jobId
- [ ] Concurrent jobs: multiple users → separate jobs
- [ ] Recovery: job > 10min → auto-failed
- [ ] Tenant isolation: store A cannot see store B's jobs
- [ ] Results retrieval: GET /jobs/:jobId returns correct data
- [ ] Cache invalidation: after job complete, cache updates

---

## Implementation Sequence

1. **Task 1** — Backend job infrastructure (async, locking, recovery)
2. **Task 2** — Advanced queries (profit, margin, category)
3. **Task 3** — Frontend job UI + polling
4. **Task 4** — Explanation templates
5. **Task 5** — Admin monitoring (parallel with Task 4)
6. **Task 6** — Advanced charts (parallel with Task 3)
7. **Task 7** — E2E full flow
8. **Task 8** — Verification & bug fixes

---

## Checkpoints

| Checkpoint | Criteria |
|---|---|
| After Task 1 | Backend accepts job, returns 202, worker processes |
| After Task 3 | Frontend submits job, polls status, displays results |
| After Task 4 | Results include penjelasan bahasa awam |
| After Task 7 | 15-step E2E passes without mock data |
| MVP Complete | Users can submit, monitor, retrieve real ML results |

---

## Known Risks

- Job processing timeout (mitigation: recovery + retry)
- Concurrent job lock contention (mitigation: SKIP LOCKED)
- Python service unavailable (mitigation: circuit breaker)
- Data consistency after rollback (mitigation: audit log)
- Cache stale after job completion (mitigation: invalidate on completion)

---

## Definition of Done

- [ ] All tasks 1-8 completed
- [ ] Code compiles without error
- [ ] All unit tests pass
- [ ] All E2E tests pass (15 steps)
- [ ] No mock data in production paths
- [ ] Tenant isolation verified
- [ ] Admin can monitor all jobs
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Deployed to main branch
