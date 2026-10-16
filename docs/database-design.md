# Database Design

Database: `bisnis_insight_analytics_db` (dev), `bisnis_insight_test` (test). Keduanya MySQL via Prisma v7 (driver adapter `@prisma/adapter-mariadb`).

ERD: lihat [`ERD.md`](./ERD.md).

## Model inti
| Area | Model |
|---|---|
| Akun | `users`, `refreshTokens` |
| Toko | `stores`, `storeMembers`, `storeInvites` |
| Data bisnis | `datasets`, `datasetMappings`, `datasetIssues`, `products`, `productCategories`, `productPrices`, `productMargins`, `suppliers`, `productSuppliers`, `customers`, `orders`, `orderItems` |
| ML | `forecastResults`, `mlJobs` |
| Sistem | `notifications`, `auditLogs` |

## Aturan
- Primary key `String @id @default(uuid())`; nama tabel `snake_case` via `@@map`.
- Uang memakai `Decimal` (hindari floating point).
- `audit_logs.storeId` sengaja tanpa FK agar log tetap ada setelah toko dihapus.
- `ml_jobs` menyimpan hasil di JSON + `forecast_results` untuk deret waktu.
- Index mengikuti pola query: `[storeId, status]`, `[status, startedAt]`, `[storeId, forecastDate]`.

## Migrasi
- Perubahan schema selalu lewat `prisma migrate`, tanpa reset otomatis di environment berisi data.
- `src/generated/prisma` adalah output Prisma Client; file generated tidak diedit manual.
- Test DB disinkronkan lewat `prisma migrate deploy` dengan `DATABASE_URL` test.

## Retensi & rollback
- Rollback dataset menghapus `orders` + `order_items` per `datasetId`, menonaktifkan produk/pelanggan yatim, dan menandai hasil ML terkait **STALE**.
- Setiap rollback dan ekspor dicatat di `audit_logs`.
