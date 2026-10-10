# Fase 1 — Fondasi BisnisInsight: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi yang bisa dijalankan, tiga role bisa login, dan **seseorang tidak bisa menyentuh data toko orang lain** — dibuktikan test, bukan klaim.

**Architecture:** NestJS 12 monorepo app (ESM, Vitest) + Prisma 7 (driver adapter MariaDB) + MySQL 8.4.3 di Laragon. Next.js 16 App Router: landing page Server Component dengan `"use cache"`; seluruh data tenant diambil Client Component → REST `/api/v1` (tanpa cache Next). Otorisasi dua lapis: `@Roles()` untuk role platform, `StoreAccessService.assertAccess()` untuk keanggotaan toko, dengan Prisma extension sebagai jaring pengaman kedua.

**Tech Stack:** NestJS 12 · TypeScript 6.0.2 (ESM `nodenext`) · Prisma 7.10.0 + `@prisma/adapter-mariadb` · MySQL 8.4.3 · Next.js 16.4.0 · React 19.3 · Tailwind v4 · Vitest 4 · oxlint

**Spec:** `docs/superpowers/specs/2026-10-10-bisnis-insight-phase-1-fondasi-design.md`

---

## Global Constraints

Berlaku untuk **seluruh** task. Nilai diambil verbatim dari spec.

- **Runtime:** Node v26.5.0 · MySQL 8.4.3 via Laragon (`D:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe`), host `127.0.0.1`, port `3306`, user `root`, tanpa password.
- **Database:** `bisnis_insight_analytics_db` (dev) dan `bisnis_insight_test` (test). **Database `umkm_insight` tidak boleh disentuh** — tidak dibaca, tidak ditulis, tidak dihapus.
- **Paket:** `prisma` & `@prisma/client` & `@prisma/adapter-mariadb` = `7.10.0`. **Tidak ada `@prisma/adapter-mysql`** — itu tidak pernah ada. `vitest` tetap `^4.1.2` (jangan upgrade ke 5.x).
- **ESM:** `package.json` sudah `"type": "module"` + `module: "nodenext"`. **Setiap import lokal wajib ekstensi `.js`**, termasuk di dalam `.ts`.
- **Uang:** tidak ada kolom uang di Fase 1. Jika muncul, wajib `Decimal(14,2)`, tidak pernah `Float`.
- **Token:** access token 15 menit, refresh token 7 hari. Access → cookie **non-HttpOnly** (bisa dibaca middleware Next). Refresh → cookie **HttpOnly**, `SameSite=Lax`, `Path=/api/v1/auth`.
- **Hashing password:** argon2id via `@node-rs/argon2`. **Refresh token disimpan sebagai SHA-256 hash**, bukan token mentah.
- **CORS:** hanya `http://localhost:3000`. Tidak ada wildcard, tidak ada `credentials: true` bersama wildcard.
- **Tidak boleh bocor ke client:** nomor error Prisma, stack trace, nilai environment variable, path file internal.
- **Tidak boleh ada `mock` di jalur inti.** Tombol/form utama harus punya fungsi.
- **Nama produk:** `BisnisInsight` (sementara, boleh diubah tanpa impact arsitektur).

---

## Review Focus

Lima kondisi yang **implisit di spec tapi tidak diuji eksplisit oleh task mana pun** — paling mungkin menggigit pengguna nyata. Masing-masing sudah dipasangkan ke task pemiliknya.

| # | Kondisi | Perilaku yang diharapkan |
|---|---|---|
| 1 | **Refresh bersamaan dari 2 tab.** Dua request `/auth/refresh` membawa token yang sama dalam hitungan detik. | Tidak boleh logout seluruh akun. Rotation harus punya grace window singkat pada token sebelumnya; hanya token yang benar-benar sudah dipakai ulang **setelah** grace window berakhir yang memicu revoke family. |
| 2 | **Owner terakhir dicabut.** `DELETE /stores/:id/members/:userId` untuk owner satu-satunya. | Ditolak `LAST_OWNER`. Toko tanpa owner tidak bisa dikelola siapa pun — dan tidak ada cara memulihkannya lewat UI. |
| 3 | **ADMIN bukan member toko.** Admin platform mencoba membuka data transaksi toko yang bukan anggotanya. | `assertAccess` menolak ADMIN yang bukan member. Admin mengelola *platform*, bukan data bisnis toko orang. Least privilege. |
| 4 | **Undangan dipakai ulang.** Token undangan yang sudah `acceptedAt` dipakai lagi. | Ditolak `INVITE_ALREADY_ACCEPTED`. |
| 5 | **Toko disuspensi.** Status toko `SUSPENDED`, lalu owner membuka dashboard. | Akses baca/tulis toko ditolak `STORE_SUSPENDED` di layer service, bukan hanya disembunyikan di UI. |

---

## Struktur File

Semua path relatif terhadap root repo `Web_UMKM/`.

### Dibuat

```
apps/backend/
  .env.example                       # semua env yang dibutuhkan, tanpa nilai rahasia
  prisma/schema.prisma               # 6 model Fase 1
  prisma.config.ts                   # koneksi DB Prisma 7 (TIDAK ada url di schema.prisma)
  src/generated/prisma/              # output Prisma Client — GITIGNORE
  src/config/configuration.ts        # skema env + validasi startup
  src/common/errors/app-error.ts     # AppError: code + status + message
  src/common/dto/response.dto.ts     # ApiResponse<T>, PaginatedMeta, PageQueryDto
  src/common/filters/all-exceptions.filter.ts
  src/common/interceptors/logging.interceptor.ts
  src/common/decorators/public.decorator.ts
  src/common/decorators/roles.decorator.ts
  src/common/decorators/current-user.decorator.ts
  src/common/guards/jwt-auth.guard.ts
  src/common/guards/roles.guard.ts
  src/database/prisma.service.ts
  src/database/prisma.module.ts
  src/database/tenant-scope.extension.ts
  src/auth/auth.module.ts
  src/auth/auth.controller.ts
  src/auth/auth.service.ts
  src/auth/password.service.ts
  src/auth/token.service.ts
  src/auth/refresh-token.service.ts
  src/auth/jwt.strategy.ts
  src/auth/dto/register.dto.ts
  src/auth/dto/login.dto.ts
  src/auth/dto/update-profile.dto.ts
  src/auth/dto/change-password.dto.ts
  src/users/users.controller.ts
  src/users/users.service.ts
  src/users/users.module.ts
  src/stores/stores.module.ts
  src/stores/stores.controller.ts
  src/stores/stores.service.ts
  src/stores/store-access.service.ts
  src/stores/guards/store-scope.guard.ts
  src/stores/dto/create-store.dto.ts
  src/stores/dto/update-store.dto.ts
  src/stores/dto/create-invitation.dto.ts
  src/invitations/invitations.controller.ts
  src/invitations/invitations.service.ts
  src/invitations/invitations.module.ts
  src/admin/admin.controller.ts
  src/admin/admin.service.ts
  src/admin/admin.module.ts
  src/audit/audit.service.ts
  src/audit/audit.module.ts
  src/health/health.controller.ts
  src/health/health.service.ts
  src/health/health.module.ts
  test/utils/test-app.ts             # helper bootstrap Nest app + client untuk e2e
  test/auth.e2e.spec.ts
  test/stores.e2e.spec.ts
  test/idor.e2e.spec.ts             # Review Focus #2, #3, #4
  test/refresh-race.e2e.spec.ts      # Review Focus #1
  test/suspension.e2e.spec.ts        # Review Focus #5

apps/frontend/
  lib/api-client.ts                  # fetch wrapper: base URL, token, error envelope
  lib/auth-session.ts                # baca/tulis cookie token di client
  lib/cn.ts                          # clsx + tailwind-merge
  components/ui/button.tsx
  components/ui/card.tsx
  components/ui/input.tsx
  components/ui/badge.tsx
  components/ui/table.tsx
  components/ui/empty-state.tsx
  components/ui/skeleton.tsx
  components/layout/dashboard-shell.tsx
  components/layout/sidebar.tsx
  app/(public)/page.tsx              # landing (ganti page.tsx lama)
  app/(auth)/login/page.tsx
  app/(auth)/register/page.tsx
  app/(auth)/undangan/[token]/page.tsx
  app/(dashboard)/dashboard/layout.tsx
  app/(dashboard)/dashboard/page.tsx # redirect sesuai role
  app/(dashboard)/dashboard/admin/users/page.tsx
  app/(dashboard)/dashboard/admin/stores/page.tsx
  app/(dashboard)/dashboard/toko/page.tsx
  middleware.ts
  .env.example

docs/authorization-matrix.md
README.md
```

### Diubah

| File | Perubahan |
|---|---|
| `apps/backend/src/main.ts` | Bootstrap lengkap: helmet, CORS, ValidationPipe, filter global, prefix `/api/v1`, Swagger |
| `apps/backend/src/app.module.ts` | Root module: ConfigModule, ThrottlerModule, PrismaModule, feature modules |
| `apps/backend/.gitignore` | Tambah `src/generated/`, `.env` |
| `apps/frontend/app/page.tsx` | **Dihapus** — digantikan `app/(public)/page.tsx` |
| `apps/frontend/app/layout.tsx` | Metadata BisnisInsight, pertahankan pola `LayoutProps<"/">` |
| `apps/frontend/app/globals.css` | Design token navy/cyan |
| `apps/frontend/next.config.ts` | Tambah `images.remotePatterns` bila perlu (lazy) |
| `apps/frontend/package.json` | Tambah dependency UI |
| `apps/backend/package.json` | Tambah dependency backend |
| `.gitignore` (root) | Tambah `apps/backend/src/generated/` |

---

## Task 1: Toolchain, Konfigurasi & Kerangka API

Fondasi yang semua task berikutnya pakai. Tidak ada database di task ini.

**Files:**
- Create: `apps/backend/.env.example`, `apps/backend/src/config/configuration.ts`, `apps/backend/src/common/errors/app-error.ts`, `apps/backend/src/common/dto/response.dto.ts`, `apps/backend/src/common/filters/all-exceptions.filter.ts`
- Modify: `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts`, `apps/backend/package.json`, `apps/backend/.gitignore`
- Test: `apps/backend/test/app.e2e.spec.ts`

**Interfaces:**
- Consumes: tidak ada (task pertama)
- Produces:
  - `AppError extends Error` — constructor `(code: string, status: number, message: string, details?: unknown[])`. Properti `.code`, `.status`, `.details`
  - `interface AppConfig { nodeEnv; port: number; databaseUrl: string; jwtSecret: string; accessTokenTtl: string; refreshTokenTtlDays: number; refreshCookieName: string; accessCookieName: string; corsOrigins: string[]; isProduction: boolean }`
  - `loadConfig(raw: Record<string, unknown>): AppConfig` — melempar dengan pesan jelas bila `DATABASE_URL` atau `JWT_SECRET` hilang
  - `interface ApiResponse<T> { data: T }` dan `interface PaginatedResult<T> { data: T[]; meta: PaginatedMeta }`, `interface PaginatedMeta { page: number; pageSize: number; total: number }`
  - `class PageQueryDto { @Type(() => Number) page = 1; @Type(() => Number) pageSize = 20 }` dengan `pageSize` maksimum 100

- [ ] **Step 1: Pasang dependency backend**

```bash
cd apps/backend
npm i @prisma/client@7.10.0 @prisma/adapter-mariadb@7.10.0 \
      @nestjs/config@12.0.1 @nestjs/jwt@12.0.2 @nestjs/passport@12.0.0 \
      @nestjs/throttler@6.7.1 @nestjs/swagger@12.0.2 \
      passport@0.7.0 passport-jwt@4.0.1 \
      class-validator@0.15.1 class-transformer@0.5.1 \
      @node-rs/argon2@2.2.2 helmet@8.3.0 pino@10.4.0 nestjs-pino@5.3.1 mysql2@3.24.5
npm i -D prisma@7.10.0
```

- [ ] **Step 2: Tulis test yang gagal — `test/app.e2e.spec.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './utils/test-app.js';
import type { INestApplication } from '@nestjs/common';

describe('App bootstrap', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await buildTestApp(); });
  afterAll(async () => { await app.close(); });

  it('GET /api/v1/health mengembalikan 200 dengan bentuk envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', timestamp: expect.any(String) } });
  });

  it('GET /api/v1/tidak-ada mengembalikan 404 dengan kode error stabil', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/tidak-ada');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).not.toContain('at ');
  });

  it('body POST tidak valid menghasilkan VALIDATION_ERROR, bukan 500', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/echo').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

`buildTestApp()` membuat instance Nest dengan `logger: false` dan override `ThrottlerModule` menjadi `{ limit: 10000, ttl: 60000 }` supaya test tidak flakak oleh rate limit (spec §11 risiko 1-3). Tambahkan route `echo` dummy di dalam `buildTestApp` **khusus test**, bukan di app.

- [ ] **Step 3: Jalankan test, pastikan gagal**

```bash
npx vitest run test/app.e2e.spec.ts
```
Harapan: gagal karena `./utils/test-app.js` belum ada.

- [ ] **Step 4: Buat `src/config/configuration.ts`**

Ekspor tipe `AppConfig`, konstanta `ACCESS_COOKIE_NAME = 'bi_at'`, `REFRESH_COOKIE_NAME = 'bi_rt'`, dan fungsi `loadConfig()`. Defaults: `port` 3000, `accessTokenTtl` `'15m'`, `refreshTokenTtlDays` 7, `corsOrigins` `['http://localhost:3000']`. Wajib: `DATABASE_URL` dan `JWT_SECRET` (min 32 karakter). `JWT_SECRET` di bawah 32 karakter harus **ditolak saat startup**, bukan diam-diam dipakai.

- [ ] **Step 5: Buat `src/common/errors/app-error.ts` dan `src/common/dto/response.dto.ts`**

Kelas `AppError` seperti di blok Interfaces, dengan nama statis yang sering dipakai: `AppError.unauthorized()`, `AppError.forbidden()`, `AppError.notFound()`, `AppError.conflict(code, message)`, `AppError.badRequest(code, message, details?)`.

- [ ] **Step 6: Buat `src/common/filters/all-exceptions.filter.ts`**

`@Catch()` global. Memetakan: `AppError` → `.status`/`.code`; `HttpException` → kode dari `getResponse()` bila ada, selain itu `HTTP_ERROR`; `Prisma.PrismaClientKnownRequestError` → `P2002`→409 `DUPLICATE`, `P2025`→404 `NOT_FOUND`, `P2003`→409 `FK_VIOLATION`; sisanya → 500 `INTERNAL_ERROR`.

> **Prisma error code hanya boleh muncul di log internal, tidak di response.** Pesan 500 ke client selalu `INTERNAL_ERROR` dengan teks generik.

- [ ] **Step 7: Tulis `src/main.ts`**

`helmet()` → CORS `{ origin: config.corsOrigins, credentials: true }` → `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))` → filter global → `app.setGlobalPrefix('api/v1')` → Swagger di `/docs` dengan bearerAuth → `app.listen(config.port)`.

- [ ] **Step 8: Tulis `src/health/health.controller.ts` + `health.module.ts`**

`GET /api/v1/health` mengembalikan `{ status: 'ok', timestamp }` tanpa menyentuh database (supaya tetap hidup saat DB mati). `GET /api/v1/health/details` (nanti diberi `@Roles('ADMIN')` di Task 6) mengembalikan status komponen.

- [ ] **Step 9: Jalankan test, pastikan hijau**

```bash
npx vitest run test/app.e2e.spec.ts
```
Harapan: 3 test hijau.

- [ ] **Step 10: Lint & commit**

```bash
npm run lint
git add -A && git commit -m "feat(backend): toolchain, config, error envelope, global filter, bootstrap"
```

---

## Task 2: Prisma 7 + Skema + Jaring Tenant

Task berisiko tertinggi. **Spike di Step 2–3 wajib — kalau gagal, berhenti dan perbaiki, jangan lanjut ke Task 3.**

**Files:**
- Create: `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts`, `apps/backend/src/database/prisma.service.ts`, `apps/backend/src/database/prisma.module.ts`, `apps/backend/src/database/tenant-scope.extension.ts`, `apps/backend/.env.example`
- Modify: `.gitignore` (root), `apps/backend/.gitignore`, `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/database.e2e.spec.ts`

**Interfaces:**
- Consumes: `AppConfig`, `AppError` (Task 1)
- Produces:
  - `class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy` dengan `$connect()` di `onModuleInit` dan `$disconnect()` di `onModuleDestroy`
  - `const TENANT_MODELS: readonly string[]` — daftar nama model yang punya kolom `storeId`
  - `function withTenantScope<T>(client: T, storeId: string): T` — mengembalikan proxy yang menyuntikkan `where: { storeId }` pada operasi `findMany`/`findFirst`/`count`/`updateMany`/`deleteMany`, dan melempar `AppError.forbidden()` bila `storeId` kosong
  - `class PrismaModule` — `@Global()`, `exports: [PrismaService]`
  - `src/common/types/prisma-enums.ts` — re-export `Role`, `StoreStatus`, `StoreMemberRole` dari generated client. **Semua task berikutnya import enum dari sini**, tidak pernah dari path `generated/` langsung — supaya sekali saja yang harus ikut berubah kalau Prisma mengubah lokasi output.

- [ ] **Step 1: Buat `.env.example` dan `.gitignore`**

`apps/backend/.env.example` berisi nama variabel + komentar, **tanpa nilai rahasia**:

```
NODE_ENV=development
PORT=3000
DATABASE_URL=mysql://root@127.0.0.1:3306/bisnis_insight_analytics_db
JWT_SECRET=
CORS_ORIGINS=http://localhost:3000
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
ML_SERVICE_URL=http://127.0.0.1:8000
```

`.gitignore` tambahan: `src/generated/`, `.env`, `.env.*` (kecuali `.env.example`), `prisma/*.db`.

- [ ] **Step 2: SPIKE — konfirmasi bentuk `prisma.config.ts` Prisma 7**

Buat `apps/backend/.env` lokal (di-gitignore) berisi `DATABASE_URL` dan `JWT_SECRET` acak 32+ karakter. Lalu jalankan:

```bash
npx prisma --version
npx prisma validate
```

> **Jangan menebak bentuk file ini.** Baca `node_modules/prisma/dist/config*` atau `node_modules/prisma/config.d.ts` untuk memastikan nama export (`defineConfig`) dan kunci yang tersedia (`schema`, `migrations`, `datasource.url`, `adapter`, `experimental`). Yang sudah pasti dari Context7: **di Prisma 7, `url` tidak lagi ada di `schema.prisma` — koneksi lewat `prisma.config.ts`.**

Buat database bila belum ada:

```bash
& 'D:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe' -u root -e "CREATE DATABASE IF NOT EXISTS bisnis_insight_analytics_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
& 'D:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe' -u root -e "CREATE DATABASE IF NOT EXISTS bisnis_insight_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

- [ ] **Step 3: Tulis `prisma/schema.prisma`**

Generator `provider = "prisma-client"` dengan `output = "../src/generated/prisma"`. `datasource db { provider = "mysql" }` — **tanpa `url`**.

Enam model dengan bentuk persis berikut (id `@default(uuid())` dan `@updatedAt`):

| Model | Kolom |
|---|---|
| `users` | `id`, `email String @unique`, `name String @db.VarChar(191)`, `passwordHash String @db.VarChar(191)`, `role Role @default(OWNER)`, `isActive Boolean @default(true)`, `failedLoginCount Int @default(0)`, `lockedUntil DateTime?`, `createdAt`, `updatedAt` |
| `stores` | `id`, `name @db.VarChar(191)`, `city String?`, `timezone @default("Asia/Jakarta")`, `status StoreStatus @default(ACTIVE)`, `createdById` FK→`users` (RESTRICT), `createdAt`, `updatedAt` |
| `store_members` | `@@id([storeId, userId])`, `storeId` FK CASCADE, `userId` FK CASCADE, `role StoreMemberRole @default(STAFF)`, `joinedAt`. Index `@@index([userId])` |
| `store_invites` | `id`, `storeId` FK CASCADE, `email @db.VarChar(191)`, `tokenHash @unique @db.VarChar(64)`, `role StoreMemberRole`, `expiresAt`, `acceptedAt?`, `invitedById` FK→`users`, `createdAt`. Index `@@index([storeId, email])` |
| `refresh_tokens` | `id`, `userId` FK CASCADE, `tokenHash @unique @db.VarChar(64)`, `familyId @db.VarChar(36)`, `expiresAt`, `revokedAt?`, `replacedById?`, `createdAt`. Index `@@index([userId])`, `@@index([familyId])` |
| `audit_logs` | `id`, `actorId?` FK→`users` (SET NULL), `storeId?`, `action @db.VarChar(64)`, `entity @db.VarChar(64)`, `entityId?`, `ip @db.VarChar(45)`, `userAgent @db.VarChar(255)`, `meta Json?`, `createdAt`. Index `@@index([storeId, createdAt])`, `@@index([actorId])` |

Enum: `Role { ADMIN OWNER STAFF }`, `StoreStatus { ACTIVE SUSPENDED }`, `StoreMemberRole { OWNER STAFF }`.

> **`users.role` = role platform** (siapa orangnya). **`store_members.role` = peran dalam toko**. Keduanya sengaja terpisah agar satu orang bisa OWNER di toko A dan STAFF di toko B.

- [ ] **Step 4: Jalankan migration**

```bash
npx prisma migrate dev --name init_fondasi
npx prisma generate
```

Verifikasi jumlah tabel = 6 dan `bisnis_insight_test` masih kosong.

- [ ] **Step 5: Tulis test yang gagal — `test/database.e2e.spec.ts`**

```ts
it('PrismaService bisa	query ke database dev', async () => {
  const n = await prisma.user.count();
  expect(typeof n).toBe('number');
});

it('withTenantScope menyuntikkan filter storeId', async () => {
  // seed 2 user, 2 store, 1 member di store A saja
  const scoped = withTenantScope(prisma.storeMember, storeA.id);
  const rows = await scoped.findMany({});
  expect(rows.every((r) => r.storeId === storeA.id)).toBe(true);
});

it('withTenantScope menolak storeId kosong', () => {
  expect(() => withTenantScope(prisma.storeMember, '')).toThrow(AppError);
});

it('tabel audit_logs menerima Json pada kolom meta', async () => {
  await expect(prisma.auditLog.create({ data: { action: 'X', entity: 'Y', meta: { a: 1 } } }))
    .resolves.toHaveProperty('id');
});
```

- [ ] **Step 6: Jalankan test, pastikan gagal** — `npx vitest run test/database.e2e.spec.ts`

- [ ] **Step 7: Implementasikan `prisma.service.ts`, `prisma.module.ts`, `tenant-scope.extension.ts`**

`PrismaService` menginstansiasi driver adapter dari `PrismaMariadb` memakai `config.databaseUrl`. `PrismaModule` `@Global()`.

`tenant-scope.extension.ts` mengekspor `TENANT_MODELS` (praktisnya: `['stores','storeMembers','storeInvites']` — model Fase 1 yang punya `storeId`) dan `withTenantScope`.

- [ ] **Step 8: Jalankan test, pastikan hijau**

- [ ] **Step 9: Pastikan client generated tidak masuk git**

```bash
git status --short apps/backend/src/generated
git check-ignore -v apps/backend/src/generated/prisma/client.ts
```
Harapan: ignored.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(backend): Prisma 7 + skema fondasi + tenant scope"
```

---

## Task 3: Autentikasi

**Files:** `src/auth/*`, `src/users/*`, test `test/auth.e2e.spec.ts`
**Interfaces:**
- Consumes: `PrismaService`, `AppError`, `ApiResponse`, config
- Produces:
  - `PasswordService.hash(plain: string): Promise<string>` · `verify(hash: string, plain: string): Promise<boolean>`
  - `TokenService.signAccessToken(payload: { sub: string; email: string; role: Role }): string`
  - `RefreshTokenService.issue(userId: string): Promise<{ token: string; expiresAt: Date }>` — `token` = string acak base64url, disimpan sebagai SHA-256
  - `RefreshTokenService.rotate(presented: string): Promise<{ userId: string; token: string; expiresAt: Date }>` — **Review Focus #1: ada grace window 10 detik** pada token yang baru dicabut; kalau token yang presented dicabut < 10 detik lalu dan masih punya `replacedById`, perlakukan sebagai race dan return token pengganti, bukan revoke family
  - `RefreshTokenService.revokeFamily(familyId: string): Promise<void>`
  - `AuthService.register(dto: RegisterDto): Promise<{ user; accessToken: string; refreshToken: string; refreshExpiresAt: Date }>`
  - `AuthService.login(dto: LoginDto): Promise<same>`
  - `AuthService.refresh(presented: string): Promise<same>`
  - `AuthService.logout(presented: string): Promise<void>`
  - `AuthService.me(userId: string): Promise<{ id; email; name; role; stores: Array<{ id; name; role: StoreMemberRole; status: StoreStatus }> }>`
  - `class JwtStrategy extends PassportStrategy(Strategy)` — `validate(payload)` mengembalikan `{ userId, email, role }`
  - `class JwtAuthGuard extends AuthGuard('jwt')` — menghormati `@Public()`
  - `UsersService.getMe(userId): Promise<UserProfile>` · `updateMe(userId, dto: UpdateProfileDto): Promise<UserProfile>` · `changePassword(userId, dto: ChangePasswordDto): Promise<void>` — password lama diverifikasi sebelum yang baru disimpan, dan seluruh refresh token milik user dicabut (password berubah = semua sesi lain ikut mati)

**Test wajib (`test/auth.e2e.spec.ts`):**

```ts
it('register membuat user OWNER tanpa toko', ...)                    // dan TIDAK punya store_members
it('register menolak password < 8 karakter dengan VALIDATION_ERROR')
it('register menolak email duplikat dengan DUPLICATE (409)')
it('login berhasil mengembalikan accessToken + cookie refresh', ...)
it('login gagal password salah Increment failedLoginCount', ...)
it('login yang gagal 10x mengunci akun (lockedUntil di masa depan)', ...)
it('logout mencabut refresh token', ...)
it('GET /auth/me tanpa token → 401', ...)
it('GET /auth/me mengembalikan daftar toko yang boleh diakses', ...)
it('GET /users/me mengembalikan profil tanpa passwordHash', ...)
it('PATCH /users/me menolak email yang sudah dipakai user lain', ...)
it('change password mencabut semua refresh token milik user', ...)
```

> **`passwordHash` tidak boleh pernah muncul di response mana pun.** Ini Dicek eksplisit oleh test di atas, bukan lewat eyeballing.

**Review Focus #1 langsung di sini:**

```ts
it('refresh bersamaan (2 tab) tidak logout user', async () => {
  const login = await loginAs('owner@contoh.id');
  const [a, b] = await Promise.all([
    request(app).post('/api/v1/auth/refresh').set('Cookie', rt(login)),
    request(app).post('/api/v1/auth/refresh').set('Cookie', rt(login)),
  ]);
  expect(a.status).toBe(201);
  expect(b.status).toBe(201);
  // family tidak dicabut: token lama masih bisa dipakai setelah grace window
});
```

---

## Task 4: Otorisasi — Role & Tenant

Task yang **menjagaewa integritas seluruh sistem**. Kalau ini bocor, semua Fase berikutnya tidak berarti.

**Files:** `src/common/decorators/*`, `src/common/guards/*`, `src/stores/store-access.service.ts`, `src/stores/guards/store-scope.guard.ts`, test `test/idor.e2e.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard`
- Produces:
  - `@Public()` · `@Roles(...roles: Role[])` · `@StoreAccess(minimum?: StoreMemberRole)` · `@CurrentUser()`
  - `CurrentUser()` mengembalikan `AuthUser { userId: string; email: string; role: Role }`
  - `StoreAccessService.assertAccess(userId: string, storeId: string, minimum?: StoreMemberRole): Promise<StoreMembership>` — **lempar `AppError.forbidden()` (`STORE_FORBIDDEN`) bila bukan member; `STORE_SUSPENDED` bila toko `SUSPENDED`; `INSUFFICIENT_ROLE` bila peran kurang.** ADMIN yang bukan member **ditolak**.
  - `StoreAccessService.listAccessible(userId: string): Promise<StoreSummary[]>`
  - `StoreAccessService.isOwner(userId: string, storeId: string): Promise<boolean>`
  - `type StoreRoleRank = { OWNER: 2; STAFF: 1 }` dan `hasAtLeast(role, minimum)` — `minimum` opsional berarti hanya keanggotaan yang dicek

- [ ] **Step 1: Tulis test IDOR yang gagal — `test/idor.e2e.spec.ts`**

```ts
describe('IDOR', () => {
  it('OWNER toko A tidak bisa GET toko B', ...)          // → 403 STORE_FORBIDDEN
  it('OWNER toko A tidak bisa PATCH toko B', ...)
  it('OWNER toko A tidak bisa DELETE toko B', ...)
  it('OWNER toko A tidak bisa melihat member toko B', ...)
  it('STAFF tidak bisa meng invited anggota lain', ...)    // → 403
  it('STAFF tidak bisa escalate role-nya jadi OWNER', ...) // → 403
  it('STAFF hanya melihat toko yang ditugaskan', ...)      // GET /stores berisi 1 toko
  it('ADMIN platform bukan member toko → tetap 403', ...)  // Review Focus #3
  it('ADMIN bisa melihat daftar toko platform', ...)       // via /admin/stores
  it('storeId di query string tidak melewati guard', ...)   // ?storeId=tokoB diabaikan
});
```

**Review Focus #3 adalah baris `ADMIN platform bukan member toko → tetap 403`** — inilah yang membedakan "admin omnipoten" dari "least privilege". Jangan sampai lolos.

- [ ] **Step 2: Jalankan, pastikan gagal**

- [ ] **Step 3: Implementasikan decorator, guard, dan `StoreAccessService`** sesuai blok Interfaces. `StoreScopeGuard` membaca `:storeId` dari params, memanggil `assertAccess`, dan menaruh hasilnya di `request.storeMembership`.

- [ ] **Step 4: Pasang guard di `AppModule`** sebagai `APP_GUARD`: `JwtAuthGuard` → `RolesGuard` → `StoreScopeGuard`. Semua kecuali `@Public()` otomatis terlindungi.

- [ ] **Step 5: Jalankan test, pastikan hijau**

- [ ] **Step 6: Commit** — `feat(backend): RBAC + store access guard + IDOR suite`

---

## Task 5: Toko, Anggota & Undangan

**Files:** `src/stores/stores.controller.ts`, `stores.service.ts`, DTO, `src/invitations/*`, test `test/stores.e2e.spec.ts`
**Interfaces:**
- Consumes: `StoreAccessService`, `@StoreAccess()`, `PrismaService`
- Produces: `StoresService.create(userId, dto)` (membuat store + `storeMembers` OWNER dalam **satu transaksi**), `.list(userId)`, `.get(userId, storeId)`, `.update(userId, storeId, dto)`, `.members(userId, storeId)`, `.updateMember(userId, storeId, targetUserId, dto)`, `.removeMember(userId, storeId, targetUserId)`, `.invite(userId, storeId, dto)`; `InvitationsService.accept(token, userId)`; `InvitationsService.preview(token)`

**Test wajib:**

```ts
it('register → buat toko otomatis jadi OWNER', ...)
it('OWNER bisa mengundang pegawai; token dikembalikan sekali (raw), hash tersimpan', ...)
it('preview undangan valid memunculkan email + nama toko', ...)
it('accept undangan membuat store_members dengan role yang diundang', ...)
it('undangan kedaluwarsa ditolak INVITE_EXPIRED', ...)
it('undangan yang sudah accepted tidak bisa dipakai lagi', ...)  // Review Focus #4 → INVITE_ALREADY_ACCEPTED
it('undangan ke email yang sudah punya akun Tetap works (user login dulu)', ...)
it('owner terakhir tidak bisa dicabut', ...)                    // Review Focus #2 → LAST_OWNER (409)
it('STAFF tidak bisa meng invites siapa pun', ...)
it('suspension toko memblokir akses baca & tulis', ...)          // Review Focus #5 → STORE_SUSPENDED (403)
```

> **Review Focus #2:** `removeMember` dan `updateMember` **keduanya** harus refuse bila operasi itu akan membuat toko kehilangan owner terakhirnya. Menurunkan owner terakhir ke STAFF termasuk operasi yang sama risikonya dengan menghapus.

---

## Task 6: Audit, Admin & Dokumentasi Otorisasi

**Files:** `src/audit/*`, `src/admin/*`, `src/health/health.controller.ts` (tambah `details`), `docs/authorization-matrix.md`
**Interfaces:**
- Consumes: semua modul sebelumnya
- Produces: `AuditService.record(entry: { actorId?: string; storeId?: string; action: string; entity: string; entityId?: string; meta?: Record<string, unknown> }): Promise<void>`; `AdminController` dengan `GET /admin/users`, `PATCH /admin/users/:userId/status`, `GET /admin/stores`, `GET /health/details`

`AuditService.record` **tidak boleh melempar error** — kegagalan audit tidak boleh menggagalkan operasi bisnis; cukup di-log sebagai `WARN`.

**Test wajib:**

```ts
it('PATCH status user menulis audit_log dengan actor yang benar', ...)
it('admin.users menolak STAFF dengan 403', ...)
it('health/details tidak membocorkan env var maupun stack trace', ...)
it('audit log tidak pernah membocorkan passwordHash', ...)   // scan string output
```

`docs/authorization-matrix.md` memuat tabel spec §6.4 persis seperti tertulis di spec, plus kolom "dijaga oleh" yang menunjuk guard mana.

---

## Task 7: Frontend — Design System & Landing Page

**Files:** `components/ui/*`, `lib/cn.ts`, `app/globals.css`, `app/layout.tsx`, `app/(public)/page.tsx`
**Interfaces:**
- Consumes: tidak ada
- Produces: `cn(...inputs: ClassValue[]): string`; komponen `Button`, `Card`, `Input`, `Badge`, `Table`, `EmptyState`, `Skeleton` dengan prop `variant`/`size` yang konsisten; token CSS `--color-navy`, `--color-accent`

- [ ] **Step 1: Pasang dependency frontend**

```bash
cd apps/frontend
npm i clsx tailwind-merge lucide-react
```

- [ ] **Step 2: Tulis design token di `globals.css`** — navy `#0B1B3A`, aksen cyan `#22D3EE`, netral abu. Hapus blok `prefers-color-scheme: dark` yang sekarang membalik warna secara otomatis; dark mode belum termasuk Fase 1 dan menyisakan kontras tak terkontrol.

- [ ] **Step 3: Bangun komponen `ui/`** — satu file per komponen, props terkunci.

- [ ] **Step 4: Hapus `app/page.tsx` lama, buat `app/(public)/page.tsx`**

Landing page lengkap sesuai spec §7.3. Page-level: `'use cache'` di ekspor, `export const revalidate` tidak perlu.

> **Semua angka, grafik, dan hasil prediksi di landing page wajib berlabel "Data contoh".** Dataset yang ada sintetis dan bukan milik pengguna mana pun.

- [ ] **Step 5: Verifikasi di browser**

```bash
cd apps/frontend && npm run dev
```

Gunakan skill `next-dev-loop` untuk memastikan halaman benar-benar render (bukan hanya compile). Cek: tidak ada error `cacheComponents`, section lengkap, mobile 375px tidak horizontal scroll.

- [ ] **Step 6: Commit** — `feat(frontend): design system + landing page`

---

## Task 8: Frontend — Auth, Middleware & API Client

**Files:** `lib/api-client.ts`, `lib/auth-session.ts`, `app/(auth)/*`, `middleware.ts`, `apps/frontend/.env.example`
**Interfaces:**
- Consumes: envelope `ApiResponse`/`PaginatedResult` + `error.code` dari backend (Task 1)
- Produces:
  - `apiFetch<T>(path: string, options?: { method?: string; body?: unknown; auth?: boolean }): Promise<T>` —Throws `ApiError` dengan `.status` dan `.code` saat `!res.ok`. Header `Authorization: Bearer` ditambahkan bila `auth !== false`
  - `getAccessToken(): string | null` · `setAccessToken(t: string): void` · `clearAccessToken(): void` — membaca/menulis cookie `bi_at`

- [ ] **Step 1: Tulis `lib/api-client.ts` dan `lib/auth-session.ts`** sesuai Interfaces.

- [ ] **Step 2: Tulis `middleware.ts`** — proteksi `/dashboard/*`. **Kegagalan redirect ke `/login` bila cookie access tidak ada.** Gate UX, bukan keamanan; backend tetap memvalidasi.

> **Next 16:** middleware berjalan di Edge runtime. Jangan import modul Node (`fs`, `crypto`) di sini — cukup baca `request.cookies`.

- [ ] **Step 3: Bangun halaman auth** — login, register, undangan/[token]. Form dengan validasi client, state loading & error dari `ApiError.code`.

- [ ] **Step 4: Verifikasi alur nyata di browser dengan `next dev`** — daftar → login → `/dashboard` → guard redirect ke `/dashboard/toko`.

- [ ] **Step 5: Commit** — `feat(frontend): auth pages + middleware + api client`

---

## Task 9: Frontend — Shell Dashboard 3 Role

**Files:** `app/(dashboard)/dashboard/*`, `components/layout/*`
**Interfaces:**
- Consumes: `GET /auth/me` (tokoh + role), `GET /admin/users`, `GET /admin/stores`
- Produces: `dashboard/layout.tsx` (shell), `dashboard/page.tsx` (redirect server-side sesuai role), `dashboard/admin/users/page.tsx`, `dashboard/admin/stores/page.tsx`, `dashboard/toko/page.tsx`

- [ ] **Step 1: `dashboard/page.tsx`** — baca session; redirect ke `/dashboard/admin` bila `role === 'ADMIN'`, selain itu `/dashboard/toko`.

- [ ] **Step 2: `dashboard/layout.tsx` + `sidebar.tsx`** — menu berbeda per role. **Menu yang disembunyikan adalah UX, bukan keamanan.**

- [ ] **Step 3: Halaman Admin** — tabel user (Client Component → `apiFetch`), ubah status aktif/nonaktif. Terapkan `EmptyState`, `Skeleton`, dan error state.

- [ ] **Step 4: Halaman Toko** — daftar toko milik user, info anggota. Untuk PEGAWI, **halaman yang sama read-only tanpa tombol mutasi**.

- [ ] **Step 5: Verifikasi di browser** — login sebagai ADMIN vs OWNER, pastikan menu dan halaman berbeda. Verifikasi juga bahwa STAFF yang mencoba `/dashboard/admin/*` **ditolak backend** (bukan cuma disembunyikan).

- [ ] **Step 6: Commit** — `feat(frontend): dashboard shells untuk 3 role`

---

## Task 10: README, .env.example Root & Verifikasi Final

- [ ] **Step 1: Tulis `README.md` root** — prasyarat, cara menjalankan tiap service, urutan setup database, cara seed, test, troubleshooting.
- [ ] **Step 2: `.env.example` root** — semua variabel terpusat dengan penjelasan.
- [ ] **Step 3: Jalankan seluruh verifikasi dan simpan output**

```bash
cd apps/backend && npm run build && npm run lint && npm test && npm run test:e2e
cd apps/frontend && npm run build && npm run lint
```

- [ ] **Step 4: Uji manual alur penuh** — daftar OWNER → buat toko → kirim undangan → login PEGAWI → **PEGAWAI hanya melihat 1 toko**. Lalu coba akses toko kedua langsung lewat URL: harus 403.
- [ ] **Step 5: Pastikan `umkm_insight` tidak tersentuh**

```bash
& 'D:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe' -u root -e "SELECT table_schema, table_rows FROM information_schema.tables WHERE table_schema='umkm_insight' LIMIT 5;"
```
Harapan: identik dengan kondisi awal (11 tabel besar).

- [ ] **Step 6: Commit final**

---

## Catatan Pelaksanaan

- **Setiap task diakhiri commit.** Kalau sebuah task gagal di tengah, `git reset --hard` ke commit sebelumnya tidak menghapus apa pun yang penting.
- **Task 2 adalah gerbang.** Kalau spike Prisma 7 gagal, **berhenti di situ** dan laporkan — jangan membangun 8 task lain di atas fondasi yang belum terbukti.
- **Review Focus adalah test, bukan niat.** Kalau salah satu dari lima kondisi itu belum punya test hijau di task-nya, fase ini **belum selesai** meski semua tombol terlihat bekerja.
- **Tidak ada angka mock.** Kalau data belum ada, tampilkan empty state dengan penjelasan. Kalau tabel belum dibuat, buat tabelnya — jangan tampilkan `0`.