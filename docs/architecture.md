# Arsitektur BisnisInsight

## Ringkasan
Monorepo: `apps/frontend` (Next.js App Router), `apps/backend` (NestJS + Prisma v7), `services/ml` (FastAPI + scikit-learn/statsmodels/mlxtend), `data/`, `storage/`, `docs/`.

```
Next.js  ->  NestJS REST /api/v1  ->  Prisma v7  ->  MySQL
                    |
                    +--> ML internal API (FastAPI, HTTP)
```

## Batas tanggung jawab
- **Frontend**: UI, design system, client fetch untuk data tenant. Tidak pernah akses MySQL.
- **Backend**: auth, RBAC, tenant isolation, validasi, orkestrasi job ML, penyimpanan hasil via Prisma.
- **ML service**: preprocessing, training, evaluasi, inference. Tidak menulis tabel operasional MySQL.

## Multi-tenant
- Semua data bisnis diakses lewat `storeId`.
- `JwtAuthGuard -> RolesGuard -> StoreScopeGuard`.
- `StoreScopeGuard` memeriksa `store_members`; ID dari frontend bukan bukti wewenang.
- `TENANT_MODELS = ['storeMembers', 'storeInvites']` untuk prisma extension; model lain di-scope manual.

## Job ML (async)
- Tabel `ml_jobs` sebagai antrean (MySQL, tanpa Redis/Docker).
- Worker NestJS memakai `SELECT ... FOR UPDATE SKIP LOCKED`.
- Idempotency key mencegah job ganda.
- Recovery: job `running` > 10 menit ditandai `failed`.
- `MlClientService` dengan timeout, retry maks 2, circuit breaker.
- Hasil disimpan di `ml_jobs.result` dan `forecast_results`.

## Background tanpa Redis
`setInterval` worker 5 detik; cache in-memory sebagai fallback Redis.

## File storage
- Upload dataset: `storage/uploads/<storeId>/<uuid>` (di luar public).
- Laporan/ekspor: `storage/reports/...`; path internal tidak pernah dikirim ke klien.
- Artefak model: `services/ml/artifacts/<type>/v<N>/` (di-gitignore, regenerate via training).
