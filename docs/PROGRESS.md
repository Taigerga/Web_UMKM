# Progress BisnisInsight

Terakhir diperbarui: 20 Oktober 2026.

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
| Reskin frontend (20 Okt) | Tahap 1-5 | Selesai dikerjakan (lihat bawah) |
| Reskin frontend | Tahap 6: landing didesain ulang | Selesai dikerjakan (20 Okt) |
| Fix 5 bug laporan pengguna (20 Okt) | Unggah lambat, KPI 0, ML fetch failed, pesanan tanpa pager, 429 | Selesai dikerjakan (lihat bawah) |

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

## Reskin frontend + fix 401 (20 Okt 2026)
Latar: laporan pengguna — (1) console penuh 401 Unauthorized, (2) tombol "Keluar" menggantung di kiri-tengah karena sidebar "hanya setengah", (3) dashboard terasa sempit. Semua murni perbaikan frontend; backend tidak disentuh.

- **Akar 401**: enam panel (`analytics-panel`, `analytics-job-panel`, `catalog-panel`, `data-panel`, `orders-panel`, `reports-panel`) melakukan `fetch()` langsung dengan `credentials: "include"` saja, padahal `JwtAuthGuard` backend hanya membaca header `Authorization: Bearer` (`apps/backend/src/auth/jwt.strategy.ts`) — cookie `bi_at` TIDAK dibaca guard. Semua request itu selalu 401 dan `parse()` diam-diam membuang `!ok`, jadi datanya kosong tanpa pesan. Fix: refactor penuh ke `sessionRequest`/`sessionFetch` (`lib/session-refresh.ts`) dengan helper per endpoint di `lib/dashboard-data.ts`; `api-client.ts` pecah jadi `sendRequest` + `ensureOk` dan kini menerima `FormData` (unggah dataset). Test baru `single-api-lane.test.ts` mengunci aturan "satu jalur keluar ke backend".
- **Sidebar sticky**: `lg:h-full` tak berarti di anak shell `min-h-screen` (persentase jatuh ke `auto`, sidebar menyusut mengikuti isi). Diganti `lg:sticky lg:top-0 lg:h-dvh`; menu `flex-1` mendorong profil + "Keluar" ke kiri-bawah, menu panjang menggulir sendiri. Rail gelap `bg-forest` (hijau hutan), aktif `bg-forest-soft` + `text-accent-light`.
- **Reskin token** (`app/globals.css`): palet hangat/hijau non-neon — `paper #f5f4ea`, `surface #fdfcf7`, keluarga `forest` (pengganti navy, nama token diganti ikut nilai), aksen zaitun `#3f6212` (teks ~5.2:1) + `accent-light` sage untuk permukaan gelap, `line-strong #6f7466` (≥3:1, WCAG 1.4.11). Neon `#22d3ee` dan semua gradient dekoratif dihapus. Chart memakai `var(--chart-*)` serupa desain (zaitun/teal/amber/abu). saturasi rendah, satu fitur pembeda, `prefers-reduced-motion` dihormati. Pass rename token sempat mojibake-kan em-dash (PowerShell membaca BOM-less sebagai ANSI) — dipulihkan.
- **Kerapian panel** (audit visual per halaman via dev server + browser, login demo-toko): wadah Card ber-token (sebelumnya `rounded border` polos = `currentColor` di Tailwind v4 → garis hitam gemuk), input berlabel grid 2-3 kolom (Pola `invite-member-form`), unggah dataset jadi dropzone, KPI rupiah ringkas (`formatRupiah`: ≥1 jt → "Rp 1,2 jt", di bawahnya utuh), tabel detail produk/tren dilipat ke `<details>` di kartu grafiknya (kartu duplikat dihapus), empty state jujur di katalog/pesanan/tabel, pesan status ber-token positif/kritis, radio laporan `accent-accent`.
- **Verifikasi**: lint 0 error; test 130/130; build pass; sweep 10 halaman dashboard via browser: TIDAK ada 401 dan tidak ada galat console (galat parse yang terekam bersifat sementara saat file sedang diedit, dev server kini melaporkan 0 error).
- Commit: `263dfbc` (sessionRequest), `29a80b5` (sidebar sticky), `4b3b0c4` (palet + token chart), `2c7065d` (kerapian panel).
- **Tahap 6 — landing di-desain ulang** (wireframe disetujui pengguna, lalu dikode): copy kedaluwarsa dibenahi (klaim "Direncanakan Fase 2/3-4", "belum ada dashboard/unggah/ML" diganti status jujur "Aktif di dasbor" — Fase 2-4 sudah selesai), grid Fitur ML ditustrukturkan (kartu peramalan membentang 2 kolom dengan mini-chart SVG berlabel data contoh + 4 kartu + kartu jujur "Cara membaca hasil model"), Cara kerja jadi langkah bernomor besar ber-hairline (bukan kartu), Manfaat jadi teks editorial tanpa kartu, bagian Privasi gelap kontrasnya dinaikkan (`text-white/75`) dengan 4 ikon SVG stroke yang digambar sendiri, grafik pratinjau memakai `var(--chart-primary)` (bukan balok hijau-hitam), dan CTA band penutup baru di atas footer ("Mulai dari buku kas Anda."). Momen animasi TUNGAAL halaman: baris buku kas hero masuk staggered (`.ledger-row-in` di globals.css, hormat `prefers-reduced-motion`); animasi ini butuh prop `rowClassName` baru di `Table` (pure-per-row). Lint/test/build hijau.

## Fix 5 bug laporan pengguna (20 Okt 2026) — semua ter-commit

Laporan: unggah `demo-toko-2bulan.csv` (988 baris) kelamaan; KPI ringkasan tampil 0 dulu; kelima model ML "fetch failed"; pesanan manual tanpa pagination; 429 berulang. Backend disetujui disentuh untuk bug ini.

- **Bug 1 — commit dataset lambat** (`4854b9d` lalu `e0f311b`): `commit()` menjalankan SATU `$transaction` per baris CSV (upsert pelanggan + produk + cek harga ≈ 3.000 percakapan MySQL berurutan untuk 988 baris). Ditulis ulang: parse sekali di memori; satu transaksi berisi upsert per KODE UNIK (25 pelanggan + 10 produk); dua findMany paralel memetakan id; `createMany` untuk harga yang belum ada; order+item per `order_id`. Bonus: `deleteMany` by datasetId di awal membuat commit idempoten dan berpasangan sempurna dengan rollback (catatan lama "konsistensi rollback"). Terverifikasi: commit dataset demo sukses (status IMPORTED, 988 baris) dalam hitungan detik.
- **Bug 2 — KPI tampil 0 saat memuat** (`234e273`): empat KPI ringkasan memakai fallback literal "Rp 0"/0 sebelum fetch selesai. Selama `summary === null` kini tampil "—"; "Rp 0" hanya bila periode memang tanpa penjualan. "Loading..." → "Memuat...".
- **Bug 3 — kelima ML "fetch failed"** (`143ea1f`): akarnya service Python ML tidak berjalan; undici melempar `TypeError: fetch failed` mentah ke `errorMessage` job. `MlClientService` kini menerjemahkannya jadi pesan yang bisa ditindaklanjuti (sebut URL + perintah menjalankan uvicorn); galat asli tetap di log. `GET /v1/models` 404 di log uvicorn tidak berasal dari kode aplikasi (frontend/backend tidak pernah memanggil path itu). Terverifikasi setelah uvicorn hidup: kelima model (forecast, segmentation, basket, churn, anomaly) COMPLETED dengan hasil nyata dari dataset demo — anomali menandai 09-17/10-26 (hari borongan rancangan), forecast menggambar prediksi Nov + batas atas/bawah.
- **Bug 4 — pesanan tanpa pagination** (`3430235` + `4fd3416`): `orders.service.list()` mengembalikan SEMUA order. Kini ikut kontrak `PageQueryDto` (page/pageSize, cap 100) dengan `meta.total`; panel menambah tombol Sebelumnya/Berikutnya + "halaman X dari Y" yang mati otomatis di tepi; ganti toko kembali ke halaman 1. Catatan: `apiRequest` membuang amplop `{ data }`, jadi `listStoreOrders` membaca body utuh via `sessionFetch` agar `meta.total` tidak hilang (bug dedop yang dijumpai sweep: crash `meta.total` → error boundary).
- **Bug 5 — 429 berulang** (`1938b2a` + `e1c439d`): dua akar berbeda. (a) Batas default 300 req/menit per IP terlalu tipis untuk satu tab wajar (beberapa request per halaman, StrictMode mount 2×, polling job ML 2 detik) → dinaikkan 600; kuota ketat auth tidak diubah. (b) `/auth/me` ikut dijalankan throttler ketat `auth` 20/menit padahal dipanggil di setiap muat-ulang keras dashboard → `SkipThrottle({ auth: true })`. Tambahan frontend: GET yang kena 429 menunggu `Retry-After` (batas 1-10 detik) lalu diputar SEKALI; mutasi tidak pernah diputar otomatis. Test baru `throttled-retry.test.ts` (4 kasus).
- **Bug tambahan ditemukan sweep — provider sesi "ready" palsu** (`bd2b6fd`): `me()` yang gagal sementara (jaringan/429) dahulu dianggap `ready` dengan `profile === null` → nav menghilang, badge "Memuat..." selamanya, panel diam tanpa data. Kini status `error` dengan layar "Gagal memuat sesi — Coba lagi" (pemulihan tanpa login ulang, terbukti di sweep). Panel Data juga menampilkan "Memuat toko..." selama daftar toko belum sampai, bukan pesan wewenang palsu.
- **Bug tambahan — kartu dataset hilang setelah reload** (`2470af7`): panel Data hanya menyimpan dataset yang baru diunggah di state. `listStoreDatasets()` membaca `GET /stores/:id/datasets` saat mount; dataset terbaru ditautkan otomatis ke kartu aksi validasi/commit/rollback.
- **Verifikasi akhir (sweep browser)**: login demo-toko → unggah + validasi + commit `demo-toko-2bulan.csv` (IMPORTED, 988 baris, cepat) → /dashboard/orders berpager "25.913 order total — halaman 1 dari 1296" → /dashboard/analytics KPI terisi (Rp 49,3 jt / 275 pesanan / Rp 179.338 / 649 item) + grafik produk terlaris → kelima job ML COMPLETED → konsol tanpa 429/401 baru. Backend test 107/107, frontend 140/140, build kedua-duanya hijau.

## Verifikasi yang sudah dijalankan (19-20 Okt 2026)
| Perintah | Hasil |
|---|---|
| `apps/backend` `npm run build` | Pass |
| `apps/backend` `npm test` | Pass — 107/107 |
| `apps/backend` `npm run test:e2e` | Pass — 208/208 (15 file, termasuk full-flow; ML service hidup) |
| `apps/backend` `npm run lint` | Pass |
| `apps/frontend` `npm run build` | Pass |
| `apps/frontend` `npm test` | Pass — 130/130 (17 file, termasuk `single-api-lane`) |
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
