# Progress BisnisInsight

Terakhir diperbarui: 16 Oktober 2026.

## Ringkasan status
| Tahap | Nama | Status |
|---|---|---|
| Phase 1 | Fondasi multi-tenant + auth | Selesai |
| Phase 2 | Modul data (dataset & katalog) | Selesai |
| Phase 3 | Analytics, laporan, forecast | Selesai (commit 903f00c) |
| Phase 4 core | 5 ML + job async + UI ML | Selesai (commit 534a3a7) |
| Phase 4 optional | Advanced analytics + admin ML monitoring | Selesai (commit a9f2a0a) |
| Phase 5 | Laporan XLSX/PDF, notifikasi, MCP, docs | Selesai dikerjakan, terverifikasi |
| Tahap 11 | Integrasi, QA, keamanan (E2E 15 langkah) | Belum |
| Tahap 12 | Dokumentasi & deployment final | Belum |

## Selesai dikerjakan
- Phase 1: fondasi multi-tenant, auth, RBAC, StoreScopeGuard tenant isolation.
- Phase 2: dataset import, mapping, validasi, commit, rollback; CRUD produk, pelanggan, supplier, kategori, margin, order manual; laporan kualitas data.
- Phase 3: analytics dashboard, laporan HTML/CSV, forecast, backend integration.
- Phase 4: 5 kemampuan ML (forecast, RFM+KMeans, market basket, churn, anomali), job async `ml_jobs`, worker `FOR UPDATE SKIP LOCKED`, recovery, ML client, dashboard ML, advanced analytics, admin ML monitoring.
- Phase 5:
  - Laporan XLSX (multi-sheet) + PDF (PDFKit).
  - Notifikasi in-app dengan `dedupeKey` + cooldown.
  - MCP stdio server (`@rekog/mcp-nest`), tool scoped ke user login:
    `list_my_stores`, `get_sales_summary`, `get_top_products`, `get_customer_segments`,
    `list_at_risk_customers`, `get_anomalies`, `get_forecast`, `run_analysis`.
  - Ekspor pelanggan per segmen (`GET /stores/:storeId/customers/export`) + audit `customer.exported`.
  - Docs: `architecture.md`, `database-design.md`, `api-specification.md`,
    `development-guide.md`, `ERD.md`, `ml-pipeline.md`, `authorization-matrix.md`,
    `dataset-analysis.md`, `troubleshooting.md`, README diperbarui.

## Verifikasi yang sudah dijalankan (16 Okt 2026)
| Perintah | Hasil |
|---|---|
| `apps/backend` `npm run build` | Pass |
| `apps/backend` `npm test` | Pass — 103/103 |
| `apps/backend` `npm run test:e2e` | Pass — 207/207 (14 file) |
| `apps/backend` `npm run lint` | Pass (hanya warning, tanpa error) |
| `apps/frontend` `npm run build` | Pass |
| `apps/frontend` `npm test` | Pass — 75/75 (7 file) |
| `services/ml` `python -m pytest -q` | Pass — 5/5 |
| `apps/frontend` `npm run lint` | **Gagal — 7 error (pre-existing, lihat bawah)** |

Perbaikan yang ikut dijalankan:
- Test e2e `datasets.e2e.spec.ts` disesuaikan: nama file di disk di-generate server
  (anti path traversal), bukan nama asli klien.
- `.gitignore` diperbaiki agar `apps/backend/storage/{uploads,reports,temporary}` terabaikan.

## Belum dilakukan
- E2E 15 langkah (Promt §20.5).
- IDOR sweep lintas toko.
- Konsistensi rollback dataset.
- Migrasi dari nol (drop DB → `prisma migrate deploy`).
- Backup/restore.
- Perbaikan 7 error lint frontend (pre-existing, bukan dari Phase 5):
  - `components/dashboard/analytics-job-panel.tsx` — `no-explicit-any`
  - `components/dashboard/analytics-panel.tsx` — `react-hooks/set-state-in-effect`
  - `components/dashboard/catalog-panel.tsx` — `no-explicit-any`, `set-state-in-effect`
  - `components/dashboard/orders-panel.tsx` — `no-explicit-any`, `set-state-in-effect`
  - `components/dashboard/reports-panel.tsx` — `react-hooks/immutability`
- Frontend Phase 4 advanced charts: RFM scatter, forecast interval, market basket,
  churn, marker anomali.
- UI admin monitoring ML.
- Report download terpusat `GET /reports/:id/download` dengan path internal tidak
  pernah diekspos (saat ini masih endpoint langsung per tipe).

## Sisa tahapan
- **Tahap 11** — integrasi, QA, keamanan: E2E 15 langkah, IDOR sweep, rollback,
  migrasi dari nol, backup/restore.
- **Tahap 12** — dokumentasi & deployment final.

## Catatan
- Tanpa Docker/Redis; cache in-memory sebagai fallback.
- Artefak ML di `services/ml/artifacts/` di-gitignore dan harus diregenerasi lewat
  `python services/ml/training/train_all.py`.
