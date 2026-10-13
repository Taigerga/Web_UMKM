# Fase 2 Modul Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development if parallel; else use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Menambahkan modul data: upload CSV/XLSX, mapping kolom, validasi FATAL/AUTO_FIX/WARN/ACCEPT, commit/rollback, CRUD produk/pelanggan, input order manual, plus seed Toko Demo 535k baris.

**Architecture:** Backend tetap Modular Monolith NestJS + Prisma 7, tenant isolation via `StoreAccessService` + ` tenant extension `. File disimpan di luar `public`; parsing synchronously untuk ≤100k baris. Restart penuh chunking 1000 per transaction per partisi.

**Tech Stack:** NestJS 11, Prisma 7 (`@prisma/adapter-mariadb`), `csv-parse`, `xlsx`, multer disk, MySQL 8, Next.js 16, Vitest, mysql2 (seed). Tidak menggunakan Redis (fase 1 policy).

**Spec:** `docs/superpowers/specs/2026-10-13-bisnis-insight-phase-2-modul-data-design.md`

## Global Constraints

- Prisma packages locked at 7.10.0 — do not change.
- Access DB: `mysql://root@127.0.0.1:3306/bisnis_insight_analytics_db`
- No touching `umkm_insight`.
- Tenant isolation: every data store is user-private/owner-scoped; no global `_id` mutation.
- No mock numbers; empty states required.
- CSV staging outside public: `storage/uploads/`.
- Error handling: branch on `error.code`.
- Commit只 via explicit transaction.

## Review Focus

1. File upload boundary that might allow 50 MB after mime magic detection. -> test `MaxFileSizeValidator`.
2. Charset non-UTF fails in `csv-parse`. -> test encoding detection with workbook input using `iconv-lite`.
3. Wild path traversal could expose neighboring store.
4. Commit idempotency is not covered by 1000 partition case. -> test hash/check.
5. Tenant scope in roll back / product queries. -> cross-store access denied test.

---

## Task 1 — Prisma schema for module data

**Files**
- Create: `apps/backend/prisma/migrations/PHASE2` migration
- Modify: `apps/backend/prisma/schema.prisma`
- Modify: `apps/backend/test` (if enum update needed)
- Test: backend unit test compile

**Interfaces**
- Provides: `prisma.datasets`, `datasetIssues`, `products`, `productPrices`, `customers`, `orders`, `orderItems`

- [ ] **Step 1: Add models + enums**
  - `DatasetStatus`: `UPLOADED`, `VALIDATED`, `IMPORTED`, `ROLLED_BACK`, `FAILED`
  - Add dataset, dataset mappings, quality issues, product, price history, customer, order, item.
  - Prisma mappings to MySQL snake_case.
- [ ] **Step 2:** apply `npx prisma migrate dev --name phase2_modul_data`
- [ ] **Step 3:** generate client + build (`npm run build`)

## Task 2 — datasets module

**Files**
- Create: `src/datasets/datasets.module.ts`
- Create: `src/datasets/datasets.controller.ts`
- Create: `src/datasets/datasets.service.ts`
- Create: `src/datasets/dto/*`
- Modify: `src/app.module.ts`
- Test: `test/datasets/datasets.e2e.spec.ts`

**Interfaces**
- `upload(storeId, userId, file): Promise<DatasetView>`
- `getMapping`, `setMapping`, `validate`, `commit`, `rollback`

- [ ] create endpoints `POST /stores/:storeId/datasets`, `GET /.../datasets`, `GET /.../datasets/:id`, `GET template`
- [ ] tests: 401 no session, unauthorized roles, file max, simple upload

## Task 3 — validation engine

**Files**
- Create: `src/datasets/validation/*`
- tests for columns mapping + quality issues

## Task 4 — commit + rollback

**Files**
- Prefer schema transactional updates through Prisma ` prisma.$transaction`
- Add rollback by datasetId
- If import already rolled back, no-op
- Test rollback order/count

## Task 5 — catalog CRUD + manual order

**Files**
- `src/catalog/products.controller.ts`, `customers.controller.ts`, `orders.controller.ts`
- `src/orders/orders.service.ts`
- DTO validations; tenant scope

## Task 6 — Frontend upload wizard + data page

**Files**
- `apps/frontend/app/dashboard/toko/data/page.tsx` etc
- no use cache
- Client fetch via `apiRequest` session

## Task 7 — catalog/order pages

**Files**
- tables and manual form as in Phase 1 UX

## Task 8 — Seed Toko Demo

**Files**
- `apps/backend/scripts/seed-toko-demo.mjs`
- `docs/dataset-analysis.md`
- test count and duration

## Task 9 — End-to-end gate

**Commands**
- `npm run build`, lint, test, e2e
- target mini CSV upload→validate→commit→rollback.

## Cross-task notes

- Plan should remain decomposed by 4 independent systems: upload, commit/rollback, catalog, seed. Each sub-stage above can be implemented and reviewed independently.
- Sequence tasks accordingly; do not start Task 4 before Task 3 tasks resolve in tests.

Use linked spec for exact field requirements and return types. ` writing-plans` terminal: self-review.
