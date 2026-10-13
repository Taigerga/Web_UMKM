# Spec - Fase 2 Modul Data

## Tujuan

Menambahkan modul data UMKM: upload CSV/XLSX, validasi, commit transaksional, rollback, CRUD produk/pelanggan, input order manual, plus seed Toko Demo yang mengisi UMKM awal dengan data penjualan riil (535k baris).

## Batas scope

Masuk:
- Upload multipart dengan validasi MIME/magic bytes/nama file.
- Template CSV/XLSX + dokumentasi kolom kanonik.
- Column mapping per batch.
- Validasi data: FATAL/AUTO_FIX/WARN/ACCEPT, laporan kualitas.
- Commit 1 transaksi, partisi 1000 baris; rollback per dataset; stale hasil ML.
- CRUD produk/pelanggan (search/filter/sort/page) + harga historis immutable.
- Input order manual oleh pegawai.
- Seed Toko Demo via `mysql2` batch, statistik CSV tidak masuk DB.

Tidak masuk (fase lain): forecast/ML, report XLSX/PDF, MCP, notifikasi.

## Pemecahan sub-proyek (CLARITY)

1. **Upload + validasi** (tanpa commit) – MVP aman.
2. **Commit + rollback** – transaksi total + status job.
3. **CRUD + input manual** – UX operasional.
4. **Toko Demo seed** – data riil 535k baris.

Ratchet: kalau (1) selesai lebih awal dan ternyata commit tidak menyisakan ruang, naikkan path ke refactor.

## Architecture high level

Backend:
- Module `datasets` (`/api/v1/stores/:storeId/datasets/*`)
- Module `catalog` (`products`, `customers`) dengan tenant scope `store_members`.
- Module `orders` / `order_items` (baru).
- Helper generic `TenantGuard` berbasis `StoreAccessService` (sudah ada).
- Data domain logic dipisah ke service, controller thin.
- Upload disk di `storage/uploads/<storeId>/<uuid>.<ext>` (di luar `public`), cleanup via cron/manual GC (fase 5).

Frontend:
- `/dashboard/toko/data` (list dataset, job status, upload)
- `/dashboard/toko/data/upload` (wizard mapping)
- `/dashboard/toko/produk`, `/dashboard/toko/pelanggan`
- `/dashboard/toko/order/baru` (form order)
- komponen charts tidak dimasukkan – fase 4.

## Data model

Tabel baru (Prisma, migration terpisah):

- `datasets (id, storeId, status: UPLOADED|VALIDATED|IMPORTED|ROLLED_BACK|FAILED, fileName, fileHash, uploadedById, createdAt, committedAt, rowCount)`
- `dataset_mappings (id, datasetId, mappingJson, createdAt)`
- `dataset_issues (id, datasetId, severity, code, rowNumber, column, message, count)`
- `products (id, storeId, sku, name, category, unit, createdAt, updatedAt, deletedAt?)`
- `product_prices (id, productId, effectiveFrom, price)"`
- `customers (id, storeId, code, name, segment, createdAt, updatedAt)`
- `orders (id, storeId, datasetId?, customerId, orderDate, channel, total, status)`
- `order_items (id, orderId, productId, qty, price, discount)`

R-4 tenant: setiap query baca store-scoped lewat `withTenantScope`, kecuali audit.

## Upload pipeline

1. Controller `POST /stores/:storeId/datasets`:
   - Parse multipart dengan `@nestjs/platform-express` Multer disk storage.
   - `ParseFilePipe` MaxFileSize (contoh 50MB, plan) + FileType + custom magic bytes validator.
   - Sanitasi filename (hilangkan path traversal).
2. Service `upload()`:
   - Buat row `datasets status=UPLOADED`, simpan hash file (`sha256`).
3. Endpoint `GET /stores/:storeId/datasets/:id/template` (CSV + XLSX) – header kanonik + contoh.
4. Endpoint `POST /.../mapping`:
   - parse header, simpan mapping.
5. Endpoint `POST /.../validate` (synchronous ≤ 100k baris; di atas itu nanti di worker):
   - parser (csv-parse atau xlsx), statistik, issues.
6. Endpoint `POST /.../commit`: transaksi, partisi.
7. Endpoint `POST /.../rollback`.

Read/parse spec: encoding non-UTF autodetect (iconv-lite), limiter row 10MB max sniff.

## Validation (4 severity)

- FATAL: block import (kolom wajib kosong, format tanggal tidak sah, duplikat yang tidak dapat dikonfirmasi)
- AUTO_FIX: auto-correct (trim whitespace, casing kota) + catatan
- WARN: import OK, ditandai kualitas
- ACCEPT: mayoritas

Issues persist as `dataset_issues` ringkasan.

Data quality report:
- row receivable, rejected, dropped, blank, suspicious value, applied rules, business impact.

## Mapping / format

Header kanonik fase 2 minimal:
- `order_id`, `order_date`, `customer_code/name`, `product_code/name`, `category`, `qty`, `unit_price`, `total_price`, `channel`.

Template menunjukkan semua, user dapat memetakan.

## commit / rollback

- Commit:
  - Blast `products`, `customers` (upsert by sku/code)
  - Insert `orders` + `order_items` 1000 statement
  - Update dataset `status=IMPORTED`, `committedAt`.
- Harga historis immutable: buka baris baru di `product_prices`.
- Rollback:
  - Hapus by datasetId; orphans set status ROLLED_BACK.
  - Mark hasil ML terkait `STALE` (R-4) – tabel `analysis_status` stub (jika belum ada).
  - Audit log.

## CRUD + manual input

- `GET /products?search=&category=&sort=&page=&pageSize=`
- PATCH produk + `POST /product-prices` (harga efektif) tidak menulis ulang harga lama.
- `GET /customers` dengan segment.
- `POST /orders` manual + item.

## Dataset Toko Demo seed (script `scripts/seed-toko-demo.mjs`)

- Lewat `mysql2` (`INSERT ... VALUES` 1000 per statement), transaksi upload/update.
- 4 file: customer_master, product_catalog, customer analytics, order_items.
- `dataset_statistics.csv` → docs/dataset-analysis.md, bukan DB.
- Idempotent: hapus dataset demo lalu upsert (tag khusus).

## Gate

- Full flow integrasi e2e: upload mini.csv → map → validate → commit → rollback.
- unit: validator parser.
- `dataset_statistics.csv` tidak mencapai database.

## Resiko

- Excel 535k langsung di parse in-memory → streaming parser + batas 50MB.
- Duplikat concurrency upload → idempotency hash.
- Tabel orders besar → index storeId, orderDate, customerId.

## Assumptions

- MySQL 8 prod.
- No Redis fase 4; batch langsung di transaksi, jika timeout, job audit record.
- Frontend wizard sinkron (background job bila commit >30 detik).
