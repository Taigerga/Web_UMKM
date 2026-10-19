# Progress BisnisInsight

Terakhir diperbarui: 19 Oktober 2026.

## Ringkasan status
| Tahap | Nama | Status |
|---|---|---|
| Phase 1 | Fondasi multi-tenant + auth | Selesai |
| Phase 2 | Modul data (dataset & katalog) | Selesai |
| Phase 3 | Analytics, laporan, forecast | Selesai (commit 903f00c) |
| Phase 4 core | 5 ML + job async + UI ML | Selesai (commit 534a3a7) |
| Phase 4 optional | Advanced analytics + admin ML monitoring | Selesai (commit a9f2a0a) |
| Phase 5 | Laporan XLSX/PDF, notifikasi, MCP, docs | Selesai dikerjakan, terverifikasi |
| Gap closure frontend (plan 16 Okt) | Sub-plan 1-6, 8, 10 + 7a | Selesai (19 Okt) |
| Sub-plan 4-5 | ML per-toko + chart Recharts | Selesai (19 Okt) |
| Sub-plan 9 | E2E 15 langkah + skrip QA | Selesai (19 Okt) |
| Sub-plan 7b | `reportExports` + `GET /reports/:id/download` | Ditunda (lihat bawah) |
| Tahap 12 | Dokumentasi & deployment final | Belum |

## Selesai dikerjakan
- Phase 1: fondasi multi-tenant, auth, RBAC, StoreScopeGuard tenant isolation.
- Phase 2: dataset import, mapping, validasi, commit, rollback; CRUD produk, pelanggan, supplier, kategori, margin, order manual; laporan kualitas data.
- Phase 3: analytics dashboard, laporan HTML/CSV, forecast, backend integration.
- Phase 4: 5 kemampuan ML (forecast, RFM+KMeans, market basket, churn, anomali), job async `ml_jobs`, worker `FOR UPDATE SKIP LOCKED`, recovery, ML client, dashboard ML, advanced analytics, admin ML monitoring.
- Phase 5: laporan XLSX (multi-sheet) + PDF (PDFKit); notifikasi in-app `dedupeKey` + cooldown; MCP stdio server (7 tool scoped user); ekspor pelanggan per segmen + audit; docs lengkap.

## Gap closure (17-19 Okt 2026) — semua ter-commit
Rencana: `docs/superpowers/plans/2026-10-16-phase5-gap-closure.md`.
- **Buat toko**: UI `create-store-panel.tsx` di halaman Toko & Tim saat daftar kosong.
- **Navigasi per keanggotaan** (`deriveNavRole`): menu OWNER vs STAFF mengikuti peran di toko, bukan peran platform. Item `analisis-ml` tidak masuk STAFF_NAV (PROMT §5.3 — keputusan deviasi diterima).
- **Undangan**: form undangan (OWNER), halaman publik `/invitations/[token]`, accept wajib login, halaman pakai `instant = false`.
- **Gate read-only pegawai**: `canManageStore` di katalog; dataset upload/validate/commit/rollback disembunyikan untuk STAFF; input order manual kini boleh untuk STAFF (backend `@Roles` + panel — POST /customers redundan dihapus karena order manual sudah upsert pelanggan).
- **Notifikasi**: halaman notifikasi, panel tandai baca, badge belum-dibaca di sidebar (`notification-bell.tsx`, ringan tanpa polling).
- **Laporan**: `lib/report-format.ts` (path per jenis+format, teruji TDD) dipakai `reports-panel.tsx`; `setFormat` di-normalisasi di event handler, bukan effect.
- **Monitoring admin**: halaman `/dashboard/admin/monitoring` + test klien; `seed-admin.mjs` didokumentasikan di `development-guide.md`.
- **Error boundary**: `app/error.tsx`, `app/not-found.tsx`, `app/(dashboard)/error.tsx`.
- **Lint bersih**: `set-state-in-effect` di 3 panel diatasi lewat callback promise; `immutability` di reports-panel memudar setelah refactor; hook `use-prefers-reduced-motion` pakai `useSyncExternalStore`.

## ML per-toko (19 Okt 2026)
- Python: endpoint `POST /forecast/run | /segmentation/run | /basket/run | /churn/run | /anomaly/run` di `main.py` + `app/inference/per_store.py` (pytest `test_per_store.py` 7 test; total 12/12). Data dikirim di payload, artefak global TIDAK dipakai; data tidak layak → 400, bukan hasil dikarang. Churn per-toko jujur memakai aturan recency 90 hari (metadata menyatakannya).
- NestJS: `ml-data.service.ts` mengumpulkan deret harian padat + RFM + transaksi per-toko dari Prisma (spec 4 test). Worker memakai MlDataService untuk semua jobType, bukan lagi `forecast()` global. Deret dibuat `denseDailySeries` — tanggal tanpa penjualan = 0, cursor dibangun di tengah malam UTC (bug hari-terakhir-terlewat sudah tertangani di test).

## Chart Recharts (19 Okt 2026)
- `recharts` terpasang; `components/dashboard/charts/`: sales-trend, top-products, forecast (interval), segment donut, basket lift (garis lift=1), churn donut, anomali scatter; semua punya empty state jujur, label id-ID, dan `prefers-reduced-motion`.
- `resolveActiveStore` (Review Focus #5): pilihan toko user hanya dipakai kalau tercantum di keanggotaannya — diuji di `dashboard-nav.test.ts`; dipakai analytics-panel & analytics-job-panel.
- Hasil job ML dirender chart per jenis via `lib/chart-data.ts`; JSON mentah tersedia dalam `<details>`.

## E2E 15 langkah + QA (19 Okt 2026)
- `test/full-flow.e2e.spec.ts`: satu `it` berurutan memetakan 15 langkah PROMT §20.5 di stack nyata (MySQL, worker di app instance, ML service hidup): register/login → toko → undangan → accept → upload/validate/commit (fixture `flow-ml.csv`, 40 hari) → job forecast/segmentasi/churn (polling sampai completed, hasil per-toko) → analytics summary/trend/top-products → laporan HTML & CSV → staff hanya toko sendiri → 403 `STORE_FORBIDDEN` toko lain → admin: users/stores/ml-jobs/ml-models.
- Skrip QA: `apps/backend/scripts/migrate-from-zero.ps1` (drop + create + `prisma migrate deploy -Seed` opsional; gagal-aman hanya untuk database test) dan `backup-restore.ps1` (mysqldump `--single-transaction`, restore drop/create/konfirmasi). Keduanya SUDAH dijalankan: from-zero → e2e 208/208 hijau; backup → restore → verifikasi 22 tabel + e2e auth 48/48 hijau.
- `docs/development-guide.md` memuat cara pakai kedua skrip.

## Verifikasi yang sudah dijalankan (19 Okt 2026)
| Perintah | Hasil |
|---|---|
| `apps/backend` `npm run build` | Pass |
| `apps/backend` `npm test` | Pass — 107/107 |
| `apps/backend` `npm run test:e2e` | Pass — 208/208 (15 file, termasuk full-flow; ML service hidup) |
| `apps/backend` `npm run lint` | Pass |
| `apps/frontend` `npm run build` | Pass |
| `apps/frontend` `npm test` | Pass — 128/128 (16 file) |
| `apps/frontend` `npm run lint` | Pass — 0 error |
| `services/ml` `python -m pytest -q` | Pass — 12/12 |
| `migrate-from-zero.ps1` → e2e penuh | Pass — database test dibangun dari nol |
| `backup-restore.ps1` backup→restore | Pass — 22 tabel kembali, e2e auth hijau |

## Belum dilakukan
- **Sub-plan 7b ditunda** (keputusan): tabel `reportExports` + `GET /reports/:id/download` dari ROADMAP. Download saat ini tetap langsung per tipe (`/reports/sales-summary` dll), semua path internal tetap tidak diekspos. Dipilih untuk tidak menambah migrasi baru bila belum dibutuhkan.
- **Tahap 12** — dokumentasi & deployment final.
- IDOR sweep lintas toko (selain 2 kasus di full-flow) dan konsistensi rollback dataset masih verifikasi manual tambahan.

## Catatan
- Tanpa Docker/Redis; cache in-memory sebagai fallback.
- Artefak ML di `services/ml/artifacts/` di-gitignore dan harus diregenerasi lewat
  `python services/ml/training/train_all.py`. Endpoint `/run` per-toko TIDAK butuh artefak.
