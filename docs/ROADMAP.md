# Roadmap Fase 2–5

Spec detail per fase **ditulis pada fase itu**, bukan sekarang — supaya tidak basi.
Status Fase 1: `docs/superpowers/specs/2026-10-10-bisnis-insight-phase-1-fondasi-design.md`

---

## Fase 2 — Modul Data *(Spec 2)*

**Output:** upload CSV/Excel → validasi → commit ke MySQL → rollback. Plus Toko Demo terisi.

| Kelompok | Isi |
|---|---|
| Upload | multipart, validasi MIME + ukuran + magic bytes, nama file disanitasi, simpan di `storage/uploads/<storeId>/<uuid>` (di luar folder public) |
| Template | `GET /stores/:id/datasets/template` (XLSX + CSV) + dokumentasi kolom |
| Column mapping | user memetakan kolom file → kolom kanonik; mapping disimpan per batch |
| Validasi | kolom wajib, tipe, null, duplikat, format tanggal, negatif, inkonsistensi qty×harga vs total, FK tak dikenal, order tanpa item. **4 severity:** `FATAL` / `AUTO_FIX` / `WARN` / `ACCEPT` |
| Data quality report | diterima/ditolak/duplikat/kosong/format/aneh + aturan yang diterapkan + dampaknya |
| Commit | eksplisit, satu transaksi, partisi 1000 baris |
| Rollback | hapus `orders`+`order_items` by `datasetId`, nonaktifkan yatim, tandai hasil ML terkait **STALE** (aturan R4) |
| CRUD | produk & pelanggan dengan search/filter/sort/pagination; harga historis immutable |
| Manual input | form order + item untuk pegawai |
| Seed Toko Demo | 4 CSV → 535.000 baris via `mysql2` batch (`INSERT ... VALUES`, 1000/statement). `dataset_statistics.csv` **tidak** masuk DB — hanya ke `docs/dataset-analysis.md` |

**Tantangan:** bulk insert 535k baris (jangan `prisma.createMany`), encoding non-UTF.
**Gate:** upload→commit→rollback terbukti test; Toko Demo masuk ≤ 3 menit.

---

## Fase 3 — Python ML Service *(Spec 3)*

**Output:** 5 model dilatih, dievaluasi, dan bisa di-infer — berdiri sendiri, tanpa database.

Struktur: `app/` (api, core, schemas, preprocessing, features, models, inference, registry) · `training/` · `evaluation/` · `artifacts/<type>/v<N>/` · `scripts/` · `tests/`.

**Prinsip:** preprocessing ditulis **sekali**, dipakai training **dan** inference — tanpa ini, drift merusak prediksi diam-diam.

| Model | Algoritma | Catatan keputusan |
|---|---|---|
| Forecast | seasonal-naive(7) → Prophet → SARIMAX | pilih via rolling-origin CV; **baseline wajib** — kalau model kompleks tidak menang, pakai baseline. 90 hari ≈ 13 minggu, jangan klaim pola tahunan |
| Segmentation | RFM + K-Means, K=2..8 | pilih via silhouette + elbow + stabilitas. Label bisnis diberikan **setelah** clustering, dari profil aktual — bukan dari nomor cluster |
| Market Basket | FP-Growth (mlxtend) | min_support configurable, plus lift/leverage/conviction. **Asosiasi ≠ sebab-akibat** |
| Churn | XGBoost vs RandomForest | churn = tak belanja 90 hari; split time-based; metrik PR-AUC + F1 + recall kelas high-risk. Faktor pakai `xgboost.pred_contribs` (SHAP tidak terpasang) |
| Anomaly | Isolation Forest + robust z-score (rolling MAD) | flag "perlu ditinjau", **bukan** "fraud" |

**Gate:** pytest hijau; tiap model punya baseline pembanding + angka metrik nyata di `artifacts/*/v1/metadata.json`.

---

## Fase 4 — Integrasi ML + Dashboard *(Spec 4)*

**Output:** hasil ML sampai ke layar, dari data nyata.

**A — Backend:** `MlClient` (timeout, retry maks 2, circuit breaker) · endpoint analisis membalas `202` + `jobId` · **worker** NestJS terpisah dengan `SELECT ... FOR UPDATE SKIP LOCKED` · idempotency key · recovery job `RUNNING` > 10 mnt · query analitik (KPI, tren, per produk, per kategori, profit & margin) · status & riwayat job.

**B — Frontend:** design system · route groups · **semua data tenant lewat client fetch** (R7) · Recharts (tren, forecast + interval, RFM scatter, basket, churn, marker anomali) · halaman Owner / Staff / Admin · animasi Motion dengan hormat `prefers-reduced-motion` · penjelasan bahasa awam + periode + ketidakpastian.

**Gate:** klik "Jalankan Analisis" → job jalan → hasil muncul. Tidak ada angka mock.

---

## Fase 5 — Laporan, Notifikasi, MCP, QA *(Spec 5)*

**Output:** laporan dari data nyata, notifikasi tanpa spam, AI assistant via MCP, e2e hijau, dokumentasi lengkap.

| Kelompok | Isi |
|---|---|
| Laporan | XLSX (ExcelJS, multi-sheet) + PDF (PDFKit, chart vektor). `GET /reports/:id/download` — path internal tidak pernah di-expose |
| Export | pelanggan per segmen, minimal data, **wajib** `audit_logs` |
| Notifikasi | in-app dengan `dedupeKey` + cooldown |
| MCP | `@rekog/mcp-nest`, transport stdio. Tools: `list_my_stores`, `get_sales_summary`, `get_top_products`, `get_customer_segments`, `list_at_risk_customers`, `get_anomalies`, `run_analysis`, `get_forecast` — **semua scoped ke user yang login** |
| QA | e2e 15 langkah §20.5, sweep IDOR, konsistensi rollback, migration dari nol, backup/restore |
| Docs | architecture, database-design (+ERD), api-specification, dataset-analysis, ml-pipeline, authorization-matrix, development-guide, troubleshooting, README |

**Gate:** e2e 15 langkah hijau; PDF berisi angka aktual; MCP tidak bisa bocor lintas-toko.