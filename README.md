# BisnisInsight — Fase 1 Fondasi

Platform analitik penjualan untuk UMKM Indonesia, fase 1: fondasi multi-tenant,
autentikasi, tenant isolation, dan dashboard tiga peran. Belum ada upload data
penjualan, ML, atau laporan — itu fase berikutnya.

## Prasyarat

- Node.js 26.5 (backend dan frontend)
- MySQL 8.x (Laragon atau manual). Buat database `bisnis_insight_analytics_db`.
  JANGAN menimpa database `umkm_insight` lain yang mungkin ada di mesin lokal.
- npm

## Instalasi

```powershell
cd apps\backend
npm install
copy .env.example .env
# isi JWT_SECRET minimal 32 karakter
npx prisma migrate deploy

cd ..\frontend
npm install
copy .env.example .env.local
```

## Menjalankan

```powershell
# terminal 1
cd apps\backend
npm run start:dev   # port 3000

# terminal 2
cd apps\frontend
npm run dev         # port 3001
```

Buka `http://localhost:3001`.

## Verifikasi

Backend:

```powershell
cd apps\backend
npm run build
npm run lint
npm test
npm run test:e2e
```

Frontend:

```powershell
cd apps\frontend
npm run build
npm run lint
npm test
```

## Troubleshooting

- CORS error di browser saat auth form gagal: pastikan `CORS_ORIGINS` backend
  memuat `http://localhost:3001` untuk pengembangan lokal.
- `access token` kedaluwarsa tiap 15 menit — frontend menyambungkan refresh
  otomatis, jadi sesi seharusnya tidak terputus. Kalau terputus, periksa
  cookie `bi_rt` dengan Path `/api/v1/auth`.
- `npm run build` frontend tidak bisa di-prerender di `/dashboard` adalah
  sengaja: halaman itu hanya pengarah berbasis cookie, di-set `instant = false`.
