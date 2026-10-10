# Spec 1 — Fondasi BisnisInsight

- **Tanggal:** 2026-10-10
- **Status:** Menunggu review pengguna
- **Fase:** 1 dari 5
- **Produk:** BisnisInsight (nama sementara — tetap dapat diubah tanpaImpact arsitektur)

---

## 1. Tujuan Fase 1

Fase 1 membangun **tulang punggung yang bisa dijalankan dan diuji**, tanpa data bisnis.

Selesai bila: aplikasi bisa dinyalakan, tiga role bisa login, dan **seseorang tidak bisa menyentuh data toko orang lain** — dibuktikan test, bukan klaim.

Yang **tidak** ada di Fase 1: upload, ML, dashboard analitik, laporan. Cangkang UI saja (landing + auth + shell dashboard).

---

## 2. Konteks & batasan (hasil audit faktual)

| Fakta | Nilai | Konsekuensi desain |
|---|---|---|
| Node.js | v26.5.0 | Paket baru harus `engines.node >= 22.12` |
| Backend | NestJS 12, TypeScript 6.0.2, **ESM** (`nodenext`), Vitest, oxlint | Semua import lokal wajib ekstensi `.js`; testing pakai Vitest (bukan Jest) |
| Prisma | **7.10.0** | `generator client` output ESM + driver adapter + `prisma.config.ts` |
| MySQL | 8.4.3 via Laragon, port 3306, root tanpa password | DB baru `bisnis_insight_analytics_db` |
| Database lama | `umkm_insight` (18 tabel, 192.845 transaksi) | **Arsip. Tidak disentuh, tidak dihapus, tidak dipakai.** |
| Frontend | Next.js 16.4.0, React 19.3, Tailwind v4/Turbopack | App Router di root `app/` (tanpa `src/`) |
| Next config | `cacheComponents: true`, `partialPrefetching: true` | Cache **hanya** untuk konten public (lihat §7.4) |
| Password hashing | — | `@node-rs/argon2` (prebuilt, tanpa kompilasi native) |

---

## 3. Aturan emas Fase 1

Aturan ini mengikat seluruh 5 Fase. Perubahan di sini wajib direview ulang.

- **R2 — Money bukan float.** Semua nominal `Decimal(14,2)`, persentase `Decimal(8,4)`. Tidak ada `Float` untuk uang.
- **R3 — Hard delete hanya lewat batch.** Baris transaksi tidak pernah dihapus individual; hanya via rollback `datasetId`.
- **R7 — Data tenant selalu fresh.** Tidak ada `use cache` Next.js untuk data toko. Lolosan cache antar-pengguna adalah kebocoran data, bukan sekadar bug performa.
- **R8 — Namai yang dipercaya.** ID dari frontend adalah **permintaan**, bukan bukti所有权. Membership di backend yang memutuskan.

---

## 4. Struktur folder target

```
Web_UMKM/
├── apps/
│   ├── backend/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/           # filter, interceptor, pipe, logger, decorator
│   │   │   ├── config/           # env schema + validasi
│   │   │   ├── database/         # PrismaModule, service, extension tenant
│   │   │   ├── auth/             # module, controller, service, strategy, guard
│   │   │   ├── users/
│   │   │   ├── stores/           # toko + member + undangan
│   │   │   ├── admin/
│   │   │   └── health/
│   │   ├── test/
│   │   └── package.json
│   ├── frontend/
│   │   ├── app/
│   │   │   ├── (public)/         # landing
│   │   │   ├── (auth)/           # login, register, undangan
│   │   │   ├── (dashboard)/      # shell + 3 role
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/           # primitives (ui/)
│   │   ├── lib/                  # api client, fetch wrapper, format
│   │   ├── hooks/
│   │   ├── middleware.ts
│   │   └── package.json
├── services/ml/                  # Fase 3
├── data/raw/
├── storage/{uploads,reports,temporary}/
└── docs/
```

**Alasan module-based di backend:** NestJS + Prisma + guard. Modul per domain (`auth`, `stores`) Keeps controller/service/DTO/guard stays together, dan NestJS DI abolish kebutuhan DI container manual.

**Frontend tanpa `src/`:** Next.js偶 App Router tidak butuh `src/`; App Router punya segment config sendiri. Konsisten dengan `next.config.ts` yang sudah ada.

---

## 5. Database Fase 1

Fase 1 hanya membuat tabel yang dibutuhkan identitas & akses. Tabel bisnis dibuat di Fase 2.

```
users           (id, email UQ, name, passwordHash, role ADMIN|OWNER|STAFF,
                isActive, failedLoginCount, lockedUntil, createdAt, updatedAt)
refresh_tokens  (id, userId FK→users CASCADE, tokenHash UQ, familyId,
                expiresAt, revokedAt, replacedById, createdAt)
stores          (id, name, city, timezone, status ACTIVE|SUSPENDED,
                createdById, createdAt, updatedAt)
store_members   (storeId FK→stores CASCADE, userId FK→users CASCADE,
                role OWNER|STAFF, joinedAt,  PK(storeId,userId))
store_invites   (id, storeId FK CASCADE, email, tokenHash UQ, role,
                expiresAt, acceptedAt, invitedById, createdAt)
audit_logs      (id, actorId, storeId?, action, entity, entityId,
                ip, userAgent, meta JSON, createdAt)
```

**6 tabel.** Tidak ada tabel yang dibuat "karena namanya ada di prompt".

### Keputusan desain

| Keputusan | Alasan |
|---|---|
| `role` di `users` = **platform role** (ADMIN/OWNER/STAFF) | Admin adalah role platform, bukan sekadar OWNER toko. |
| `role` di `store_members` = **peran dalam toko** (OWNER/STAFF) | Satu orang bisa OWNER di toko A dan STAFF di toko B. Pemisahan ini避免 konflik. |
| `storeId` **tidak** ada di `users` | Satu user bisa punya banyak toko. Kepemilikan lewat `store_members`. |
| `refresh_tokens.tokenHash` = SHA-256, bukan token mentah | Kebocoran DB ≠ langsung bisa dipakai. |
| `familyId` di refresh token | Deteksi **reuse detection**: seluruh keluarga token dicabut saat ada penyalahgunaan. |
| Password hash varchar(191) | Argon2id menghasilkan string ~97 char. |
| Tidak ada soft delete di Fase 1 | `isActive` pada `users` cukup; `stores.status` untuk suspend. |

### Multi-tenant isolation

`store_members` adalah satu-satunya sumber kebenaran. Setiap akses data toko **wajib** lewat:

```
StoreAccessService.assertAccess(userId, storeId, requiredRole?)
```

Pemakaian開口 di `StoreScopeGuard` (untuk route dengan `:storeId`) dan pemanggilan eksplisit di service (untuk operasi majemuk).

**Defense in depth:** Prisma `$extends` menyuntikkan filter `storeId` ke model yang punya `storeId`, sehingga kelalaian di satu service tidak otomatis jadi kebocoran. Guard tetap wajib — extension adalah jaring kedua, bukan pengganti.

---

## 6. Backend

### 6.1 Dependency (versi terverifikasi di npm, kompatibel Node 26)

| Paket | Versi | Catatan |
|---|---|---|
| `prisma` / `@prisma/client` | 7.10.0 | `latest` di npm |
| `@prisma/adapter-mariadb` | 7.10.0 | **Adapter MySQL resmi Prisma 7.** Tidak ada `@prisma/adapter-mysql`. |
| `@nestjs/config` | 12.0.1 | |
| `@nestjs/jwt` | 12.0.2 | |
| `@nestjs/passport` + `passport` + `passport-jwt` | 12.0.0 / 0.7.0 / 4.0.1 | |
| `@nestjs/throttler` | 6.7.1 | Rate limit auth |
| `@nestjs/swagger` | 12.0.2 | |
| `class-validator` / `class-transformer` | 0.15.1 / 0.5.1 | |
| `@node-rs/argon2` | 2.2.2 | Prebuilt — tidak butuh toolchain build |
| `helmet` | 8.3.0 | |
| `pino` + `nestjs-pino` | 10.4.0 / 5.3.1 | Structured logging |
| `mysql2` | 3.24.5 | Untuk bulk insert Fase 2 |

> `vitest` tetap di **^4.1.2** (sudah terpasang & berjalan). Tidak di-upgrade ke 5.x — tidak ada keuntungan, hanya risiko.

### 6.2 Prisma 7 — konfigurasi

Perbedaan kritis dari Prisma ≤ v6:

1. `generator client` memakai `provider = "prisma-client"` (bukan `prisma-client-js`), dengan `output` eksplisit ke `src/generated/prisma`.
2. `datasource` **tidak lagi punya `url`** — koneksi lewat `prisma.config.ts`.
3. Client diinstansiasi dengan **driver adapter**:
   ```ts
   new PrismaClient({ adapter: new PrismaMariadb(prismaConfig) })
   ```
4. `@prisma/client` di ESM di-import dari path hasil generate, bukan `@prisma/client` —世俗_ISM wajib ada `.js` di import lokal.

**Spike wajib sebelum modul lain:** `prisma generate` → instantiate client → 1 query `SELECT 1`. Kalau gagal, berhenti dan perbaiki — jangan lanjut membangun di atas fondasi yang belum terbukti.

### 6.3 Autentikasi

**Strategi: JWT access 15 menit + refresh token rotasi 7 hari di cookie HttpOnly.**

```
POST /api/v1/auth/register    → hanya bisa membuat role OWNER. ADMIN hanya lewat seed.
POST /api/v1/auth/login       → access token di body, refresh cookie di-set
POST /api/v1/auth/refresh     → rotasi refresh token (token lama langsung dicabut)
POST /api/v1/auth/logout      → cabut refresh token saat ini
GET  /api/v1/auth/me          → user + daftar toko yang boleh diakses
```

- Access token: **di body response**, disimpan frontend di memori. Bukan cookie — supaya tidak ikut ter-send di setiap request dan mudah dikosongkan saat logout.
- Refresh token: **cookie `HttpOnly`, `SameSite=Lax`, `Secure` di production**, `Path=/api/v1/auth`.
- Password: argon2id (`@node-rs/argon2`), parameter default.
- Rate limit: 5 percobaan login / menit per IP+email.
- Lockout: 10 gagal berturut-turut → lock 15 menit (field `lockedUntil`).

**Kenapa bukan session murni?** Session mudah dicabut tetapi butuh query DB di setiap request dan menyulitkanKm.Token access pendek + refresh rotasi memberi window kebocoran kecil dan logout yang jelas.

**Kenapa bukan token di localStorage?** XSS bisa mencuri token persisten. Refresh di cookie HttpOnly + access di memori tahan terhadap itu.

### 6.4 Otorisasi

```
@Roles('ADMIN')            → RolesGuard, cek platform role
@StoreAccess('OWNER')      → StoreScopeGuard, cek keanggotaan + peran dalam toko
@Public()                  → JwtAuthGuard melewati
```

**Permission matrix Fase 1** (dasar; matriks lengkap didokumentasikan di Fase 5):

| Aksi | ADMIN | OWNER | STAFF |
|---|---|---|---|
| Daftar / login | Ya | Ya | Ya (via undangan) |
| Buat toko | Tidak | Ya | Tidak |
| Lihat toko | Semua | Miliknya | Yang ditugaskan |
| Undang pegawai | Tidak | Miliknya | Tidak |
| Ubah peran / cabut akses | Bust platform | Miliknya | Tidak |
| List user & toko (platform) | Ya | Tidak | Tidak |
| Status service | Ya | Tidak | Tidak |

**Staff tidak bisa mendaftar untuk masuk ke toko.** Registrasi selalu menghasilkan OWNER tanpa toko; akses toko hanya lewat undangan atau pembuatan toko sendiri.

### 6.5 Endpoint Fase 1

Semua di bawah `/api/v1`. Swagger di `/docs`.

**Auth** — `register`, `login`, `refresh`, `logout`, `me`
**Stores** — `POST /stores`, `GET /stores`, `GET|PATCH /stores/:storeId`,
`GET /stores/:storeId/members`, `PATCH /stores/:storeId/members/:userId`,
`DELETE /stores/:storeId/members/:userId`, `POST /stores/:storeId/invitations`
**Invitations** — `POST /invitations/:token/accept`
**Users** — `GET /users/me`, `PATCH /users/me`
**Admin** — `GET /admin/users`, `PATCH /admin/users/:userId/status`, `GET /admin/stores`
**System** — `GET /health`, `GET /health/details` (khusus ADMIN)

`GET /health/details` **tidak boleh** membocorkan environment variable, versi internal, atau stack trace. Hanya status komponensi + timestamp database.

### 6.6 Konvensi response

```jsonc
// sukses tunggal
{ "data": { ... } }

// sukses daftar
{ "data": [...], "meta": { "page": 1, "pageSize": 20, "total": 137 } }

// galat
{ "error": { "code": "STORE_FORBIDDEN", "message": "...", "details": [] } }
```

`error.code` stabil dan bisa diprogram (frontend tidak mem-parse `message`).

### 6.7 Error handling

Global exception filter memetakan ke kode HTTP yang benar. Prisma error dipetakan:
`P2002` → 409 `DUPLICATE`, `P2025` → 404 `NOT_FOUND`, `P2003` → 409 `FK_VIOLATION`.
Nomor Prisma **tidak pernah** dibocorkan ke client — hanya ke log internal.

Stack trace hanya di log, tidak pernah di response.

---

## 7. Frontend

### 7.1 Route

| Group | Route | Akses |
|---|---|---|
| `(public)` | `/` | Publik — landing page |
| `(auth)` | `/login`, `/register`, `/undangan/[token]`, `/lupa-password` | Publik |
| `(dashboard)` | `/dashboard` → redirect sesuai role | Protected |
| | `/dashboard/admin/*` | ADMIN |
| | `/dashboard/toko` | OWNER / STAFF |

### 7.2 Redirect sesuai role

`/dashboard` server-side redirect ke `/dashboard/admin` (ADMIN) atau `/dashboard/toko` (selainnya).Pegawai dan pemilik boleh melihat halaman yang sama; **beda的是 permission, bukan URL**. Menu Pegawai lebih kecil karena menu disembunyikan per role — tapi ini **kemsubsection**, bukan keamanan. Endpoint tetap menolak.

### 7.3 Landing page

RSC + `"use cache"`. Section: navbar, hero, preview dashboard, fitur ML, cara kerja, manfaat, privasi & keamanan, FAQ, footer.

> **Angka di landing page wajib berlabel "Data contoh".** Dataset yang tersedia bersifat sintetis dan bukan milik pengguna mana pun. Tidak ada klaim pengguna, testimoni, atau hasil prediksi seolah-olah nyata.

### 7.4 Pola data (KRITIS)

| Jenis data | Cara ambil | Alasan |
|---|---|---|
| Konten public (landing) | RSC + `"use cache"` | Sama untuk semua pengunjung |
| Shell/layout dashboard | RSC, tanpa data tenant | Cuma struktur |
| **Seluruh data tenant** | **Client Component → `fetch` ke NestJS** | Selalu fresh, tidak ada risiko cache lintas-pengguna |

> **Jangan memakai `"use cache"` untuk data toko.** `cacheComponents` + `partialPrefetching` membuat prefetch agresif. Kalau key cache tidak awareness-user, User B bisa menerima hasil query User A. Untuk dashboard analitik, "fresh by design" memang perilaku yang benar — tidak ada yang dikorbankan.

### 7.5 Middleware

`middleware.ts` memeriksa keberadaan access token cookie untuk route `/dashboard/*` dan mengarahkan ke `/login`. Ini **luxuryMv kedap**, bukan keamanan — verifikasi sebenarnya ada di backend.

> **Keputusan arsitektur yang perlu dikonfirmasi saat implementasi:** access token disimpan di memori Client Component berarti refresh halamanHilangnya. Solusi standar: simpan access token短-lived di cookie non-HttpOnly agar middleware bisa membacanya, sementara refresh token tetap HttpOnly. Implementasi final akan diuji terhadap perilaku `cacheComponents` Next 16 — bukan diasumsikan.

### 7.6 Design system

Token: navy `#0B1B3A` sebagai warna utama, cyan `#22D3EE` sebagai aksen, netral abu sebagai background. Tipografi konsisten, spacing scale, komponen primitives: `Button`, `Card`, `Table`, `Badge`, `Input`, `Select`, `DateRange`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`.

Fase 1 hanya membangun yang dipakai: layout, form auth, sidebar, tabel user/toko, empty state.

**Animasi ditunda ke Fase 4** (satu tempat, tidak dipecah), tapi `prefers-reduced-motion` dihormati sejak awal.

---

## 8. Testing

### 8.1 Wajib hijau sebelum Fase 1 dianggap selesai

| Jenis | Cakupan |
|---|---|
| Unit | `StoreAccessService`, `RolesGuard`, `RefreshTokenService` (rotasi + reuse detection), password hasher |
| Integrasi | `POST /auth/*`, `POST /stores`, `POST /invitations/:token/accept` |
| **IDOR** | User A **tidak bisa** GET/PATCH/DELETE toko B. Variasikan juga `?storeId=` pada query, dan ID di body. |
| **Privilege escalation** | STAFF tidak bisa PATCH role-nya sendiri menjadi OWNER; tidak bisa meng unenak-undangkan member lain |
| Validasi | DTO: email format, password strength, body tak dikenal ditolak |
| Rate limit | 6 percobaan login → 429 |

### 8.2 Aturan

- Vitest untuk unit + integrasi (`vitest run`), konfigurasi e2e terpisah sudah ada.
- Database test = database terpisah (`bisnis_insight_test`), **dibuat & dihapus oleh test**, tidak pernah menyentuh database dev.
- Tidak ada `any` di jalur auth/tenant. Ketat tipe = bukti IDOR tertangkap compile time.

---

## 9. Definition of Done — Fase 1

- [ ] `npm run build` backend bersih
- [ ] `npm run lint` (oxlint) bersih
- [ ] `npm test` dan `npm run test:e2e` hijau
- [ ] Migration jalan dari database kosong
- [ ] IDOR & privilege escalation test hijau
- [ ] Landing page tampil dengan benar
- [ ] Register → buat toko → undang pegawai → pegawai terima → pegawai login dan **hanya bisa lihat 1 toko** — proven by test
- [ ] ADMIN, OWNER, STAFF punya dashboard berbeda
- [ ] Swagger menampilkan semua endpoint Fase 1
- [ ] Tidak ada kredensial di repo; `.env.example` lengkap

---

## 10. Di luar lingkup Fase 1

 Sengaja tidak dikerjakan: upload & validasi (Fase 2), service Python & 5 model (Fase 3), integrasi ML & dashboard analitik (Fase 4), laporan/notifikasi/MCP (Fase 5).

---

## 11. Risiko Fase 1

| # | Risiko | Mitigasi |
|---|---|---|
| 1-1 | Prisma 7 + NestJS ESM + TS 6 belum pernah digabung | **Spike hari 1**: generate + 1 query. Gagal → berhenti, jangan lanjut. |
| 1-2 | `cacheComponents` Next 16 menolak render dinamis | Shell static + client fetch. Verifikasi lewat `next dev` sungguhan, bukan asumsi. |
| 1-3 | Rate limit aktif di mode test membuat e2e flaky | Konfigurasi throttle longgar khusus env `test`. |
| 1-4 | Cookie SameSite/CSRF saat refresh | Refresh hanya menerima cookie `SameSite=Lax` + token rotasi; akses state-changing butuh Authorization header (bukan cookie), sehingga CSRF tidak mungkin pada refresh. |

---

## 12. Keputusan yang perlu dikonfirmasi pengguna

1. **Nama** — pertahankan `BisnisInsight` untuk Fase 1? (nama bisa diganti kapan saja tanpa impact arsitektur)
2. **Akses token** — cookie non-HttpOnly agar middleware bisa baca (rekomendasi, agar refresh halaman tidak logout) vs memori murni (lebih ketat, tapi perlu workaround)? Saya ⇒ **cookie non-HttpOnly短-lived**.