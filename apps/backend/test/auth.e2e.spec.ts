import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import { MAX_FAILED_LOGIN_ATTEMPTS } from '../src/auth/auth.service.js';
import { hashRefreshToken } from '../src/auth/refresh-token.service.js';
import { buildTestApp } from './utils/test-app.js';

/**
 * Test autentikasi terhadap `bisnis_insight_test`.
 *
 * Semua file di suite ini berbagi database yang sama, jadi datanya dibersihkan
 * sebelum tiap test agar tidak saling bergantung.
 */
let app: INestApplication;
let prisma: PrismaService;

async function resetDatabase(client: PrismaService): Promise<void> {
  await client.auditLogs.deleteMany({});
  await client.refreshTokens.deleteMany({});
  await client.storeInvites.deleteMany({});
  await client.storeMembers.deleteMany({});
  await client.stores.deleteMany({});
  await client.users.deleteMany({});
}

beforeAll(async () => {
  app = await buildTestApp();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await app.close();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

const VALID_PASSWORD = 'rahasia-kuat-123';

/** Ambil nilai satu cookie dari respons supertest. */
function cookieValue(response: request.Response, name: string): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = list.find((c) => c.startsWith(`${name}=`));
  if (!match) throw new Error(`Cookie "${name}" tidak ada di respons.`);
  return decodeURIComponent(match.split(';')[0]!.slice(name.length + 1));
}

/** Seluruh atribut Set-Cookie untuk satu nama cookie. */
function cookieAttributes(response: request.Response, name: string): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = list.find((c) => c.startsWith(`${name}=`));
  if (!match) throw new Error(`Cookie "${name}" tidak ada di respons.`);
  return match;
}

const REFRESH_COOKIE = 'bi_rt';
const ACCESS_COOKIE = 'bi_at';

async function registerUser(
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<{ email: string; password: string }> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? VALID_PASSWORD;
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, name: overrides.name ?? 'Budi Santoso' })
    .expect(201);
  return { email, password, ...(res.body as unknown as object) } as {
    email: string;
    password: string;
  };
}

/**
 * Kirim login dan assert status yang diharapkan.
 *
 * Status expectation DI DALAM helper, bukan ditulis `.expect(...)` setelah
 * `await`: objek `Test` supertest sudah menjadi `Promise` begitu `.then()`
 * tersentuh, sehingga `.expect` tidak lagi tersedia di baris berikutnya.
 * Membungkus sekaligus membuat semua test login memakai pemeriksaan status
 * yang sama.
 */
async function loginAs(email: string, password = VALID_PASSWORD, status = 201) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });
  expect(res.status).toBe(status);
  return res;
}

/** Header `Cookie` dengan refresh token tertentu. */
function withRefreshCookie(token: string): [string, string] {
  return ['Cookie', `${REFRESH_COOKIE}=${token}`];
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

describe('POST /auth/register', () => {
  it('membuat user OWNER tanpa toko dan tanpa membership', async () => {
    const email = uniqueEmail();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: VALID_PASSWORD, name: 'Budi Santoso' })
      .expect(201);

    const user = await prisma.users.findUniqueOrThrow({ where: { email } });
    expect(user.role).toBe('OWNER');

    // Tidak ada toko sama sekali.
    expect(await prisma.stores.count({ where: { createdById: user.id } })).toBe(0);
    // Dan tidak ada membership.
    expect(await prisma.storeMembers.count({ where: { userId: user.id } })).toBe(0);

    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.role).toBe('OWNER');
    expect(typeof res.body.data.accessToken).toBe('string');
  });

  it('menolak password < 8 karakter dengan VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password: 'pendek', name: 'Budi' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).toContain('password');
  });

  it('menolak email duplikat dengan DUPLICATE (409)', async () => {
    const email = uniqueEmail();
    await registerUser({ email });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: VALID_PASSWORD, name: 'Duplikat' })
      .expect(409);

    expect(res.body.error.code).toBe('DUPLICATE');
    // Tetap satu user: tidak ada baris setengah jadi.
    expect(await prisma.users.count({ where: { email } })).toBe(1);
  });

  it('menolak field role dari pemanggil (forbidNonWhitelisted)', async () => {
    const email = uniqueEmail();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: VALID_PASSWORD, name: 'Penyusup', role: 'ADMIN' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // Dan tidak ada user yang terbentuk sama sekali.
    expect(await prisma.users.count({ where: { email } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

describe('POST /auth/login', () => {
  it('berhasil mengembalikan accessToken di body dan cookie refresh HttpOnly', async () => {
    const { email, password } = await registerUser();

    const res = await loginAs(email, password);

    // Access token DI BODY (R-9: app butuh untuk header Authorization).
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.accessToken.split('.')).toHaveLength(3);

    // Cookie access juga ada, dan SENGAJA tidak HttpOnly supaya middleware
    // Next.js bisa membacanya.
    const accessAttrs = cookieAttributes(res, ACCESS_COOKIE);
    expect(accessAttrs).not.toContain('HttpOnly');

    // Cookie refresh: HttpOnly, SameSite=Lax, Path=/api/v1/auth.
    const refreshAttrs = cookieAttributes(res, REFRESH_COOKIE);
    expect(refreshAttrs).toContain('HttpOnly');
    expect(refreshAttrs).toContain('SameSite=Lax');
    expect(refreshAttrs).toContain('Path=/api/v1/auth');

    // Dan TIDAK ada di body - hanya boleh lewat cookie HttpOnly.
    expect(JSON.stringify(res.body)).not.toContain('refreshToken');
  });

  it('access token di body cocok dengan isi cookie access', async () => {
    const { email, password } = await registerUser();
    const res = await loginAs(email, password);

    // R-9: cookie di-set ulang setiap kali body dikirim, jadi tidak bisa desync.
    expect(cookieValue(res, ACCESS_COOKIE)).toBe(res.body.data.accessToken);
  });

  it('gagal dengan password salah Increment failedLoginCount', async () => {
    const { email } = await registerUser();

    const res = await loginAs(email, 'password-yang-salah', 401);

    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    const user = await prisma.users.findUniqueOrThrow({ where: { email } });
    expect(user.failedLoginCount).toBe(1);
  });

  it(`gagal ${MAX_FAILED_LOGIN_ATTEMPTS}x mengunci akun (lockedUntil di masa depan)`, async () => {
    const { email } = await registerUser();

    for (let i = 1; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      await loginAs(email, 'salah', 401);
    }
    const before = await prisma.users.findUniqueOrThrow({ where: { email } });
    expect(before.lockedUntil).toBeNull();

    await loginAs(email, 'salah', 401);

    const locked = await prisma.users.findUniqueOrThrow({ where: { email } });
    expect(locked.lockedUntil).not.toBeNull();
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Password yang BENAR juga ditolak selama terkunci.
    const res = await loginAs(email, VALID_PASSWORD, 403);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('pesan login gagal sama untuk email tidak terdaftar dan password salah', async () => {
    const { email } = await registerUser();

    const salah = await loginAs(email, 'salah', 401);
    const tidakAda = await loginAs(uniqueEmail('hantu'), 'salah', 401);

    // Kalau berbeda, endpoint ini jadi alat enumerasi email terdaftar.
    expect(salah.body.error.code).toBe(tidakAda.body.error.code);
    expect(salah.body.error.message).toBe(tidakAda.body.error.message);
  });

  it('login berhasil mereset penghitung kegagalan', async () => {
    const { email, password } = await registerUser();
    await loginAs(email, 'salah', 401);
    await loginAs(email, 'salah', 401);

    await loginAs(email, password);

    const user = await prisma.users.findUniqueOrThrow({ where: { email } });
    expect(user.failedLoginCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Refresh token: penyimpanan sebagai hash, rotasi, dan R-10 grace window
// ---------------------------------------------------------------------------

describe('refresh token', () => {
  it('disimpan sebagai SHA-256 hash, bukan token mentah', async () => {
    const { email, password } = await registerUser();
    const res = await loginAs(email, password);
    const presented = cookieValue(res, REFRESH_COOKIE);

    // Dicari lewat hash token yang baru diterima, bukan `findFirst`: `register`
    // juga sudah menerbitkan satu token, jadi baris pertama BUKAN token dari
    // login ini.
    const record = await prisma.refreshTokens.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(presented) },
    });

    // Yang tersimpan adalah digest, dan digest itu memang SHA-256 dari token.
    expect(record.tokenHash).toBe(createHash('sha256').update(presented).digest('hex'));
    expect(record.tokenHash).toBe(hashRefreshToken(presented));
    // Token mentah tidak boleh muncul di kolom mana pun.
    expect(record.tokenHash).not.toBe(presented);

    // Tidak ada baris di tabel yang memuat token mentah itu.
    const all = await prisma.refreshTokens.findMany();
    expect(all.map((t) => t.tokenHash)).not.toContain(presented);
  });

  it('rotasi memberikan token baru dan mencabut token lama', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);
    const oldToken = cookieValue(login, REFRESH_COOKIE);

    const [cookieHeader, cookieName] = withRefreshCookie(oldToken);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(cookieHeader, cookieName)
      .expect(201);

    const newToken = cookieValue(res, REFRESH_COOKIE);
    expect(newToken).not.toBe(oldToken);

    const oldRecord = await prisma.refreshTokens.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(oldToken) },
    });
    expect(oldRecord.revokedAt).not.toBeNull();
    expect(oldRecord.replacedById).not.toBeNull();
  });

  it('R-10: refresh bersamaan (2 tab) keduanya berhasil dan keluarga TIDAK dicabut', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);
    const shared = cookieValue(login, REFRESH_COOKIE);

    // `familyId` diambil dari TOKEN YANG DIPAKAI, bukan dari token pertama
    // milik user. `registerUser` sudah menerbitkan token dengan keluarga
    // sendiri, jadi `findFirstOrThrow` bisa mengembalikan keluarga yang salah.
    const familyId = (
      await prisma.refreshTokens.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(shared) },
      })
    ).familyId;

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${shared}`),
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${shared}`),
    ]);

    // KEDUA-DUANYA harus berhasil: tidak ada tab yang ikut ter-logout.
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    // Yang paling penting: keluarga TIDAK dicabut. Kalau salah satu dianggap
    // pencuri, semua token di keluarga ini akan punya revokedAt dan kedua tab
    // justru kehilangan sesi.
    const family = await prisma.refreshTokens.findMany({ where: { familyId } });
    expect(family.some((t) => t.revokedAt === null)).toBe(true);

    // Dan kedua respons memberi access token yang usable.
    expect(typeof a.body.data.accessToken).toBe('string');
    expect(typeof b.body.data.accessToken).toBe('string');
  });

  it('R-10: tab kedua yang refresh SETELAH tab pertama selesai tetap berhasil', async () => {
    // Ini yang BENAR-BENAR menguji grace window, dan bukan test paralel di
    // atas.
    //
    // Pada `Promise.all`, kedua request tiba bersama-sama sehingga KEDUA-nya
    // membaca `revokedAt === null` sebelum salah satu menulis - grace window
    // tidak pernah tersentuh, dan test tetap hijau bahkan kalau grace window
    // dihapus. Test ini sengaja SEKUENSIAL: tab A selesai rotasi dulu, baru
    // tab B mengirim token yang sama. Hanya urutan itulah yang membuat tab B
    // membaca token yang SUDAH dicabut, yaitu kondisi yang harus dilayani
    // grace window.
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);
    const shared = cookieValue(login, REFRESH_COOKIE);

    // `familyId` diambil dari TOKEN YANG DIPAKAI, bukan dari token pertama
    // milik user. `registerUser` sudah menerbitkan token dengan keluarga
    // sendiri, jadi `findFirstOrThrow` bisa mengembalikan keluarga yang salah.
    const familyId = (
      await prisma.refreshTokens.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(shared) },
      })
    ).familyId;

    // Tab A selesai.
    const a = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${shared}`)
      .expect(201);
    const tokenA = cookieValue(a, REFRESH_COOKIE);
    expect(tokenA).not.toBe(shared);

    // Tab B menyusul dengan token yang sama, beberapa milidetik kemudian.
    // Tanpa grace window, ini akan dianggap penggunaan ulang.
    const b = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${shared}`);

    expect(b.status).toBe(201);
    expect(typeof b.body.data.accessToken).toBe('string');
    const tokenB = cookieValue(b, REFRESH_COOKIE);
    expect(tokenB).not.toBe(tokenA);

    // Family harus tetap hidup untuk kedua-duanya. Kalau tab B salah dikira
    // pencuri, `a` juga ikut mati - user kehilangan sesi di tab yang justru
    // sedang aktif.
    const family = await prisma.refreshTokens.findMany({ where: { familyId } });
    const live = family.filter((t) => t.revokedAt === null);
    expect(live.map((t) => t.tokenHash)).toContain(hashRefreshToken(tokenA));

    // Token milik tab A masih bisa dipakai untuk refresh berikutnya. Ini yang
    // menangkap design grace window yang salah: kalau grace path ikut mencabut
    // token pengganti, test ini gagal - tab A kehilangan sesinya pada refresh
    // berikutnya.
    const nextA = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${tokenA}`)
      .expect(201);
    expect(typeof nextA.body.data.accessToken).toBe('string');

    // Dan token milik tab B juga, di kedua arah. Keduanya hidup bersamaan.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${tokenB}`)
      .expect(201);
  });

  it('R-10: setelah grace window, penggunaan ulang mencabut seluruh keluarga', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);
    const oldToken = cookieValue(login, REFRESH_COOKIE);

    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${oldToken}`)
      .expect(201);

    const familyId = (
      await prisma.refreshTokens.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(oldToken) },
      })
    ).familyId;

    // Majukan waktu penolakan token lama melewati grace window 10 detik. Ini
    // yang membedakan "balapan 2 tab" dari "token dicuri": keduanya sama-sama
    // memakai token yang sudah dicabut, hanya berbeda jarak waktunya.
    await prisma.refreshTokens.updateMany({
      where: { familyId, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${oldToken}`)
      .expect(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // Seluruh keluarga ikut dicabut - termasuk token yang SEDANG dipakai tab
    // lain. Ini perilaku yang benar untuk pencurian.
    const family = await prisma.refreshTokens.findMany({ where: { familyId } });
    expect(family.every((t) => t.revokedAt !== null)).toBe(true);

    // Token hasil rotasi yang sekarang sudah tercabut juga tidak bisa dipakai.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${cookieValue(first, REFRESH_COOKIE)}`)
      .expect(401);
  });

  it('R-10: grace window TIDAK berlaku untuk token yang dicabut tanpa pengganti', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);
    const token = cookieValue(login, REFRESH_COOKIE);

    const record = await prisma.refreshTokens.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(token) },
    });

    // Cabut TANPA replacedById - persis seperti yang dilakukan logout dan ganti
    // password. Grace window hanya berlaku pada token yang punya pengganti.
    await prisma.refreshTokens.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${token}`)
      .expect(401);

    expect(res.body.error.code).toBe('REFRESH_TOKEN_REUSED');
  });

  it('refresh dengan token tak dikenal ditolak', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=token-yang-tidak-pernah-ada`)
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('refresh tanpa cookie ditolak', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);

    expect(res.body.error.code).toBe('REFRESH_TOKEN_MISSING');
  });

  it('refresh mengembalikan cookie access baru yang cocok dengan body', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${cookieValue(login, REFRESH_COOKIE)}`)
      .expect(201);

    expect(cookieValue(res, ACCESS_COOKIE)).toBe(res.body.data.accessToken);
    expect(res.body).not.toHaveProperty('data.refreshToken');
  });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

describe('POST /auth/logout', () => {
  it('mencabut refresh token sehingga tidak bisa dipakai lagi', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);
    const token = cookieValue(login, REFRESH_COOKIE);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${token}`)
      .expect(204);

    const record = await prisma.refreshTokens.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(token) },
    });
    expect(record.revokedAt).not.toBeNull();

    // FamilyId tidak dicabut seluruhnya: logout hanya mencabut sesi ini.
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${token}`)
      .expect(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_REUSED');
  });

  it('logout mengosongkan kedua cookie', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${cookieValue(login, REFRESH_COOKIE)}`)
      .expect(204);

    // Atribut path harus sama dengan saat cookie di-set, kalau tidak browser
    // menganggapnya cookie berbeda dan membiarkannya utuh.
    expect(cookieAttributes(res, ACCESS_COOKIE)).toContain('Path=/;');
    expect(cookieAttributes(res, REFRESH_COOKIE)).toContain('Path=/api/v1/auth;');
    const cleared = cookieAttributes(res, REFRESH_COOKIE);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('logout tanpa cookie tetap 204 (idempoten)', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(204);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

describe('GET /auth/me', () => {
  it('tanpa token menghasilkan 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('dengan token salah menghasilkan 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer bukan-token-yang-sah')
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('mengembalikan daftar toko yang boleh diakses', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);
    const accessToken: string = login.body.data.accessToken;

    const user = await prisma.users.findUniqueOrThrow({ where: { email } });

    // Dua toko: satu ACTIVE, satu SUSPENDED. Keduanya harus muncul, dengan
    // statusnya masing-masing - client yang memutuskan cara menampilkannya.
    const storeA = await prisma.stores.create({
      data: { name: 'Toko Aktif', createdById: user.id, status: 'ACTIVE' },
    });
    const storeB = await prisma.stores.create({
      data: { name: 'Toko Nonaktif', createdById: user.id, status: 'SUSPENDED' },
    });
    await prisma.storeMembers.create({
      data: { storeId: storeA.id, userId: user.id, role: 'OWNER' },
    });
    await prisma.storeMembers.create({
      data: { storeId: storeB.id, userId: user.id, role: 'STAFF' },
    });

    // Membership di toko orang lain. User ini tidak boleh melihatnya.
    const other = await prisma.users.create({
      data: { email: uniqueEmail('lain'), name: 'Orang Lain', passwordHash: 'x' },
    });
    const storeC = await prisma.stores.create({
      data: { name: 'Toko Orang Lain', createdById: other.id },
    });
    await prisma.storeMembers.create({
      data: { storeId: storeC.id, userId: other.id, role: 'OWNER' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.id).toBe(user.id);
    expect(res.body.data.email).toBe(email);

    const ids = (res.body.data.stores as Array<{ id: string }>).map((s) => s.id).sort();
    expect(ids).toEqual([storeA.id, storeB.id].sort());
    expect(res.body.data.stores).toContainEqual(
      expect.objectContaining({ id: storeA.id, name: 'Toko Aktif', role: 'OWNER', status: 'ACTIVE' }),
    );
    expect(res.body.data.stores).toContainEqual(
      expect.objectContaining({ id: storeB.id, status: 'SUSPENDED' }),
    );
    expect(JSON.stringify(res.body)).not.toContain(storeC.id);
  });

  it('user tanpa toko mendapat daftar kosong, bukan error', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);

    expect(res.body.data.stores).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RF-3: passwordHash tidak boleh pernah muncul di response
// ---------------------------------------------------------------------------

describe('RF-3: passwordHash tidak pernah bocor', () => {
  it('tidak muncul di body sukses register/login/refresh/me/users', async () => {
    const { email, password } = await registerUser();
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password: VALID_PASSWORD, name: 'Lain' });

    const login = await loginAs(email, password);
    const accessToken: string = login.body.data.accessToken;
    const refreshCookie = `${REFRESH_COOKIE}=${cookieValue(login, REFRESH_COOKIE)}`;

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    const usersMe = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`);

    for (const res of [registered, login, refreshed, me, usersMe]) {
      const serialized = JSON.stringify(res.body);
      // Nama fieldnya, nilai hash-nya, DAN prefiks argon2. Ketiganya diuji:
      // hash argon2 bisa bocor tanpa nama fieldnya ikut bocor.
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('$argon2');
      expect(serialized).not.toContain(password);
    }
  });

  it('tidak muncul di body error, termasuk konflik email duplikat', async () => {
    const email = uniqueEmail();
    await registerUser({ email });

    const dupe = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: VALID_PASSWORD, name: 'Duplikat' })
      .expect(409);

    const badLogin = await loginAs(email, 'password-salah', 401);
    const validation = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'bukan-email', password: 'pendek', name: 'X' })
      .expect(400);

    for (const res of [dupe, badLogin, validation]) {
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('$argon2');
    }
  });
});

// ---------------------------------------------------------------------------
// Users profile
// ---------------------------------------------------------------------------

describe('/users/me', () => {
  it('mengembalikan profil tanpa passwordHash', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);

    expect(res.body.data.email).toBe(email);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('$argon2');
  });

  it('PATCH /users/me menolak email yang sudah dipakai user lain', async () => {
    const { email, password } = await registerUser();
    const other = await registerUser();

    const login = await loginAs(email, password);
    const user = await prisma.users.findUniqueOrThrow({ where: { email } });

    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ email: other.email })
      .expect(409);

    expect(res.body.error.code).toBe('EMAIL_TAK_TERSEDIA');
    // Email lama tidak berubah.
    const unchanged = await prisma.users.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.email).toBe(email);
  });

  it('PATCH /users/me bisa mengubah nama dan email sendiri', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);
    const newEmail = uniqueEmail('baru');

    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ name: 'Nama Baru', email: newEmail })
      .expect(200);

    expect(res.body.data.name).toBe('Nama Baru');
    expect(res.body.data.email).toBe(newEmail);
  });

  it('PATCH /users/me menolak upaya mengubah role', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(400);
  });

  it('tanpa token menghasilkan 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    await request(app.getHttpServer()).patch('/api/v1/users/me').send({}).expect(401);
    await request(app.getHttpServer()).post('/api/v1/users/me/password').send({}).expect(401);
  });
});

describe('POST /users/me/password', () => {
  it('mencabut semua refresh token milik user', async () => {
    const { email, password } = await registerUser();

    // Empat sesi: satu dari `register` di atas, lalu tiga "perangkat" login.
    const baseline = await prisma.refreshTokens.count();
    expect(baseline).toBe(1);

    const tokens: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await loginAs(email, password);
      tokens.push(cookieValue(res, REFRESH_COOKIE));
    }
    const user = await prisma.users.findUniqueOrThrow({ where: { email } });
    expect(await prisma.refreshTokens.count({ where: { userId: user.id } })).toBe(4);

    const login = await loginAs(email, password);
    const res = await request(app.getHttpServer())
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: password, newPassword: 'password-baru-456' })
      .expect(204);

    expect(res.body).toEqual({});

    // SEMUA token dicabut, termasuk dari sesi lain yang sedang berjalan.
    const remaining = await prisma.refreshTokens.findMany({ where: { userId: user.id } });
    expect(remaining).toHaveLength(baseline + 4);
    expect(remaining.every((t) => t.revokedAt !== null)).toBe(true);

    for (const token of tokens) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${token}`)
        .expect(401);
    }
  });

  it('password baru berlaku dan password lama tidak lagi', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);

    await request(app.getHttpServer())
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: password, newPassword: 'password-baru-456' })
      .expect(204);

    await loginAs(email, password, 401);
    await loginAs(email, 'password-baru-456');
  });

  it('menolak jika password lama salah, dan tidak mengubah apa pun', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);

    const res = await request(app.getHttpServer())
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: 'password-salah', newPassword: 'password-baru-456' })
      .expect(400);

    expect(res.body.error.code).toBe('PASSWORD_SALAH');
    // Password lama masih berlaku: tidak ada yang berubah.
    await loginAs(email, password);
  });

  it('menolak newPassword < 8 karakter dengan VALIDATION_ERROR', async () => {
    const { email, password } = await registerUser();
    const login = await loginAs(email, password);

    const res = await request(app.getHttpServer())
      .post('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: password, newPassword: 'pendek' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

/**
 * Rate limit login per IP+email (spec 6.3).
 *
 * Test ini memakai instance aplikasi sendiri dengan konfigurasi throttler yang
 * DIPAKAI (`buildTestApp({ throttlerOptions: [...] })`), bukan default longgar
 * milik suite utama. Tanpa itu, limit 5/menit akan membuat test lain flaky -
 * dan test ini sendiri tidak akan bisa membuktikan apa pun.
 *
 * Yang dibuktikan di sini: penghitungnya benar-benar DIPAKAI pada route login,
 * dan yang memicu adalah email. IP tidak bisa divariasikan lewat supertest
 * (semua request dari loopback), jadi pemisahan komponen IP-vs-email diuji
 * langsung di `src/auth/login-throttle.tracker.spec.ts`.
 */
describe('rate limit login (limit aktif)', () => {
  let limited: INestApplication;
  let limitedPrisma: PrismaService;

  beforeAll(async () => {
    limited = await buildTestApp({
      throttlerOptions: [{ name: 'auth', ttl: 60_000, limit: 5 }],
    });
    limitedPrisma = limited.get(PrismaService);
  });

  afterAll(async () => {
    await limited.close();
  });

  beforeEach(async () => {
    await limitedPrisma.auditLogs.deleteMany({});
    await limitedPrisma.refreshTokens.deleteMany({});
    await limitedPrisma.storeInvites.deleteMany({});
    await limitedPrisma.storeMembers.deleteMany({});
    await limitedPrisma.stores.deleteMany({});
    await limitedPrisma.users.deleteMany({});
  });

  const attemptLogin = (email: string) =>
    request(limited.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password-yang-salah' });

  it('login berulang ke SATU email dibatasi setelah 5 percobaan', async () => {
    const email = uniqueEmail('ratelimit');

    // 5 percobaan pertama lolos ke service (dan gagal karena password salah).
    for (let i = 0; i < 5; i += 1) {
      const res = await attemptLogin(email);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }

    // Yang ke-6 kena limit.
    const blocked = await attemptLogin(email);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('THROTTLED');
  });

  it('email BERBEDA tidak mewarisi penghitung email lain', async () => {
    const first = uniqueEmail('ratelimit-a');
    const second = uniqueEmail('ratelimit-b');

    // Habiskan jatah `first`.
    for (let i = 0; i < 5; i += 1) {
      await attemptLogin(first).expect(401);
    }
    await attemptLogin(first).expect(429);

    // `second` harus masih bisa dicoba: kalau kunci hanya per-IP, `second`
    // ikut kena 429 dan limit tidak melindungi akun yang sebenarnya diserang.
    const res = await attemptLogin(second);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('email dengan kapitalisasi berbeda TERKUNCI pada penghitung yang sama', async () => {
    // `AuthService.login` menormalisasi email, jadi `Victim@Contoh.ID` dan
    // `victim@contoh.id` adalah akun yang sama. Kalau tracker tidak ikut
    // menormalisasi, penyerang cukup memutar kapitalisasi untuk lolos limit.
    const canonical = uniqueEmail('kasus');
    const mangled = canonical.toUpperCase();

    for (let i = 0; i < 5; i += 1) {
      await attemptLogin(canonical).expect(401);
    }

    // Variasi kapitalisasi ikut terkunci.
    await attemptLogin(mangled).expect(429);
  });

  it('request tanpa email terbaca memakai satu penghitung bersama', async () => {
    // Semua request "garbage" dari IP yang sama harus berbagi satu jatah.
    // Kalau tiap payload dapat slot sendiri, bypass "kirim email acak tiap
    // request" akan berhasil.
    const server = limited.getHttpServer();
    const garbage: unknown[] = [
      {},
      { email: '' },
      { email: '   ' },
      { email: 12345 },
      { email: { nested: 'object' } },
      { unrelated: 'field' },
    ];

    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send(garbage[i]!);
      statuses.push(res.status);
    }

    // 5 pertama memakai jatah (dan ditolak validasi, bukan throttle).
    expect(statuses).not.toContain(429);

    // Yang ke-6 - payload garbage lain - kena 429.
    const blocked = await request(server)
      .post('/api/v1/auth/login')
      .send(garbage[0]!);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('THROTTLED');
  });
});

/**
 * Refresh WAJIB memeriksa ulang status akun.
 *
 * Tanpa pemeriksaan ini, `PATCH /admin/users/:userId/status` yang akan
 * datang di Task 6 tidak akan berarti apa-apa untuk sesi yang sudah ada:
 * akun yang dinonaktifkan masih bisa menukar refresh tokennya berulang kali
 * dan mencetak access token baru tanpa henti selama token tidak kedaluwarsa
 * (7 hari). `JwtStrategy` memang tidak cek database, tapi access tokennya
 * hanya berumur 15 menit - refresh tidak punya batas seperti itu, jadi di
 * sinilah pemeriksaan tempatnya.
 *
 * Setiap test di sini juga memeriksa bahwa TIDAK ada token baru yang
 * diterbitkan, dan refresh yang sah tetap berhasil memastikan pemeriksaan ini
 * tidak bisa "selalu menolak" lalu lolos tanpa terdeteksi.
 */
describe('refresh memverifikasi status akun', () => {
  /** Login dan kembalikan cookie refresh + userId. */
  async function sessionFor(email: string, password = VALID_PASSWORD) {
    const login = await loginAs(email, password);
    return {
      refreshToken: cookieValue(login, REFRESH_COOKIE),
      userId: (await prisma.users.findUniqueOrThrow({ where: { email } })).id,
    };
  }

  it('refresh yang sah tetap berhasil (langkah pembanding)', async () => {
    const { email, password } = await registerUser();
    const { refreshToken } = await sessionFor(email, password);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .expect(201);

    // Token benar-benar berganti dan bisa dipakai lagi.
    expect(typeof res.body.data.accessToken).toBe('string');
    const next = cookieValue(res, REFRESH_COOKIE);
    expect(next).not.toBe(refreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${next}`)
      .expect(201);
  });

  it('refresh ditolak kalau akun dinonaktifkan (isActive = false)', async () => {
    const { email, password } = await registerUser();
    const { refreshToken, userId } = await sessionFor(email, password);

    // Simulasi `PATCH /admin/users/:userId/status` dari Task 6.
    await prisma.users.update({ where: { id: userId }, data: { isActive: false } });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .expect(401);

    expect(res.body.error.code).toBe('SESSION_INVALID');
    // Tidak ada access token yang bocor di body error.
    expect(res.body).not.toHaveProperty('data');

    // Dan tidak ada token baru yang diterbitkan.
    const tokens = await prisma.refreshTokens.findMany({ where: { userId } });
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('refresh ditolak kalau akun terkunci (lockedUntil di masa depan)', async () => {
    const { email, password } = await registerUser();
    const { refreshToken, userId } = await sessionFor(email, password);

    // Akun terkunci karena gagal login berulang. Sesi yang sudah ada harus
    // ikut tertutup - kalau dibiarkan, lockout hanya menahan login baru
    // sementara penyerang yang sudah memegang refresh token tetap bisa masuk.
    await prisma.users.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .expect(403);

    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');

    const tokens = await prisma.refreshTokens.findMany({ where: { userId } });
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('refresh tetap jalan kalau lockedUntil sudah lewat (lock kedaluwarsa)', async () => {
    const { email, password } = await registerUser();
    const { refreshToken, userId } = await sessionFor(email, password);

    // Lock yang sudah kedaluwarsa tidak boleh memblokir: user yang menunggu
    // 15 menit harus bisa masuk lagi.
    await prisma.users.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .expect(201);
  });

  it('refresh ditolak kalau user-nya sudah dihapus', async () => {
    const { email, password } = await registerUser();
    const { refreshToken, userId } = await sessionFor(email, password);

    // Hapus akun. `refresh_tokens` punya FK `onDelete: Cascade` ke `users`,
    // jadi baris token ikut terhapus dan `rotate` menolak lebih dulu di
    // `INVALID_REFRESH_TOKEN` - bukan di cek `!user` di AuthService.
    // Kedua-duanya menutup akses; test ini mengunci perilaku yang terlihat
    // dari luar, bukan cabang internal yang dipilih.
    await prisma.users.delete({ where: { id: userId } });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(res.body).not.toHaveProperty('data');
    expect(await prisma.refreshTokens.count({ where: { userId } })).toBe(0);
  });

  it('refresh ditolak kalau user dinonaktifkan SEJAK refresh token diterbitkan', async () => {
    // Menutup celah urutan waktu: admin menonaktifkan akun di antara login
    // dan refresh. Sesi lama ikut mati.
    const { email, password } = await registerUser();
    const { refreshToken, userId } = await sessionFor(email, password);

    await prisma.users.update({ where: { id: userId }, data: { isActive: false } });

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .expect(401);
  });

  it('akun nonaktif tidak bisa login ulang dengan password benar', async () => {
    // Pelengkap: refresh sudah tertutup (test di atas), tapi jalur login juga
    // harus menolak - kalau tidak, nonaktifkan akun hanya bisa dilewati dengan
    // logout lalu login.
    const { email, password } = await registerUser();
    const { userId } = await sessionFor(email, password);

    await prisma.users.update({ where: { id: userId }, data: { isActive: false } });

    const res = await loginAs(email, password, 403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });
});
