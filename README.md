# BisnisInsight

Platform analitik penjualan untuk UMKM: multi-tenant, auth/RBAC, import & validasi dataset, 5 kemampuan Machine Learning, dashboard analitik, laporan, dan MCP assistant.

Status: Fase 1–5 selesai. Gate E2E 15-langkah (Prompt §20.5) masih ditunda ke akhir.

## Fitur
- Auth owner/staff/admin, refresh token cookie, tenant isolation (`storeId`).
- Import CSV/Excel → mapping → validasi → commit/rollback + laporan kualitas data.
- CRUD produk/pelanggan/supplier/kategori/margin; input order manual.
- 5 ML: forecasting, segmentasi RFM+K-Means, market basket, churn, anomali.
- Job ML async di MySQL (`ml_jobs`) + worker `FOR UPDATE SKIP LOCKED`.
- Dashboard analitik, laporan XLSX multi-sheet + PDF (PDFKit).
- Notifikasi in-app (`dedupeKey` + cooldown), ekspor pelanggan per segmen (diaudit).
- MCP server stdio (`@rekog/mcp-nest`), tool scoped ke user login.
- Audit log, health check, rate limit, Swagger.

## Prasyarat
- Node.js 24+/26, npm
- MySQL 8.x (Laragon). Database: `bisnis_insight_analytics_db`, test: `bisnis_insight_test`.
- Python 3.x untuk `services/ml`.

## Menjalankan
```powershell
# backend
cd apps\backend
npm install
copy .env.example .env      # isi DATABASE_URL + JWT_SECRET (>=32 char)
npx prisma migrate dev
npm run start:dev           # http://localhost:3000/api/v1

# frontend
cd apps\frontend
npm install
copy .env.example .env.local
npm run dev                 # http://localhost:3001

# ML service
pip install -r services\ml\requirements.txt
python -m uvicorn app.main:app --app-dir services\ml --port 8000
```

## Verifikasi
```powershell
cd apps\backend
npm run build; npm run lint; npm test; npm run test:e2e

cd apps\frontend
npm run build; npm run lint; npm test

cd services\ml
pytest
```

## MCP
```powershell
cd apps\backend
npm run build
npm run mcp
```
Setiap tool menerima `accessToken` + `storeId` dan memvalidasi keanggotaan toko.

## Dokumentasi
- [Arsitektur](docs/architecture.md)
- [Database design](docs/database-design.md) · [ERD](docs/ERD.md)
- [API specification](docs/api-specification.md)
- [ML pipeline](docs/ml-pipeline.md) · [Dataset analysis](docs/dataset-analysis.md)
- [Authorization matrix](docs/authorization-matrix.md)
- [Development guide](docs/development-guide.md)
- [Troubleshooting](docs/troubleshooting.md)

## Troubleshooting
- CORS: pastikan `CORS_ORIGINS` backend memuat `http://localhost:3001`.
- Access token 15 menit; refresh cookie `bi_rt` Path `/api/v1/auth`.
- `/dashboard` tidak di-prerender (diet `instant = false`) — disengaja.
- Lihat [docs/troubleshooting.md](docs/troubleshooting.md) untuk detail.
