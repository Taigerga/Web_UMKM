import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import { buildTestApp } from './utils/test-app.js';

/**
 * Endpoint admin platform.
 *
 * Tiga hal yang diuji, dan ketiganya punya bentuk yang berbeda:
 *
 * - **Matriks izin.** `admin.users` menolak STAFF dengan 403 - dan juga OWNER,
 *   karena `OWNER` adalah peran platform yang dipakai semua user UMKM, jadi
 *   menjadikannya wewenang platform adalah kesalahan yang paling mungkin terjadi.
 *   Positive control dengan ADMIN wajib ada di setiap test 403; tanpa itu,
 *   "403" hanya bisa berarti "endpoint ini rusak".
 * - **Bentuk respons.** Daftar admin tidak boleh memuat `passwordHash`, dan
 *   `PATCH status` harus benar-benar mengubah baris yang dituju - bukan hanya
 *   menjawab 200.
 * - **Audit.** `PATCH status` menulis `admin.user_status_changed` dengan pelaku
 *   yang BENAR. Pelaku diambil dari token, bukan dari path: kalau keduanya sama,
 *   test ini tidak bisa membedakan endpoint yang mengaudit pelaku dari endpoint
 *   yang mengaudit target.
 */
let app: INestApplication;
let prisma: PrismaService;

const VALID_PASSWORD = 'rahasia-kuat-123';

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

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

interface TestUser {
  id: string;
  email: string;
  token: string;
}

/** Ambil `auditFailures` dari `/health/details` sebagai ADMIN. */
async function fetchAuditFailures(adminToken: string): Promise<number> {
  const res = await request(app.getHttpServer())
    .get('/api/v1/health/details')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  return res.body.data.auditFailures as number;
}

/** Daftar lewat API, ubah peran platform, lalu login. */
async function createUser(role: 'ADMIN' | 'OWNER' | 'STAFF'): Promise<TestUser> {
  const email = uniqueEmail(role.toLowerCase());
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password: VALID_PASSWORD, name: `Uji ${role}` })
    .expect(201);

  const user = await prisma.users.update({ where: { email }, data: { role } });

  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: VALID_PASSWORD })
    .expect(201);

  return { id: user.id, email, token: login.body.data.accessToken };
}

// ---------------------------------------------------------------------------
// GET /admin/users
// ---------------------------------------------------------------------------

describe('GET /admin/users', () => {
  it('menolak STAFF dengan 403', async () => {
    const staff = await createUser('STAFF');

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${staff.token}`)
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    // Isi daftar platform tidak boleh ikut bocor lewat pesan penolakan.
    expect(JSON.stringify(res.body)).not.toContain('data');
  });

  it('menolak OWNER dengan 403', async () => {
    // `OWNER` adalah peran platform yang dipakai semua user UMKM. Test dengan
    // STAFF saja akan meninggalkan celah yang paling mungkin dipakai.
    const owner = await createUser('OWNER');

    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403);
  });

  it('menolak tanpa token dengan 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);
  });

  it('ADMIN boleh, dan positive control-nya mengikuti', async () => {
    // Positive control wajib. Tanpa bagian ini, ketiga test 403 di atas tetap
    // hijau kalau endpoint-nya selalu menolak - termasuk ADMIN.
    const admin = await createUser('ADMIN');
    const target = await createUser('OWNER');

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const ids = (res.body.data as Array<{ id: string }>).map((u) => u.id);
    expect(ids).toContain(admin.id);
    expect(ids).toContain(target.id);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 2 });
  });

  it('tidak pernah mengirim passwordHash, walaupun hash-nya ada di database', async () => {
    const admin = await createUser('ADMIN');
    await createUser('OWNER');

    // Positive control: hash-nya BENAR-BENAR ada di tabel. Kalau baris ini
    // tidak punya `passwordHash`, test di bawah tidak membuktikan apa pun.
    const stored = await prisma.users.findMany({ select: { passwordHash: true } });
    expect(stored.every((u) => u.passwordHash.length > 10)).toBe(true);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const dump = JSON.stringify(res.body);
    for (const row of stored) {
      expect(dump).not.toContain(row.passwordHash);
    }
    expect(dump).not.toMatch(/argon2|passwordHash/i);

    // Bentuk barisnya persis yang dispesifikasikan.
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'isActive',
      'name',
      'role',
    ]);
  });

  it('halaman berikutnya tidak mengulang baris dan meta	total benar', async () => {
    const admin = await createUser('ADMIN');
    await createUser('OWNER');
    await createUser('OWNER');

    const first = await request(app.getHttpServer())
      .get('/api/v1/admin/users?page=1&pageSize=2')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const second = await request(app.getHttpServer())
      .get('/api/v1/admin/users?page=2&pageSize=2')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const idsOf = (res: typeof first): string[] => (res.body.data as Array<{ id: string }>).map((u) => u.id);

    expect(first.body.data).toHaveLength(2);
    expect(second.body.data).toHaveLength(1);
    expect(first.body.meta.total).toBe(3);
    expect(second.body.meta.total).toBe(3);
    expect(idsOf(first).filter((id) => idsOf(second).includes(id))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PATCH /admin/users/:userId/status
// ---------------------------------------------------------------------------

describe('PATCH /admin/users/:userId/status', () => {
  it('menulis audit_log dengan actor yang benar', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('OWNER');

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false })
      .expect(200);

    expect(res.body.data).toMatchObject({ id: target.id, isActive: false });

    // Barisnya benar-benar berubah di database, bukan hanya di respons.
    const row = await prisma.users.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.isActive).toBe(false);

    const auditRows = await prisma.auditLogs.findMany({
      where: { action: 'admin.user_status_changed' },
    });
    expect(auditRows).toHaveLength(1);

    // Pelakunya ADMIN yang memanggil, targetnya user yang statusnya diubah.
    // Kalau keduanya tertukar, test ini gagal - dan itulah yang membedakannya
    // dari sekadar "ada baris audit".
    expect(auditRows[0]).toMatchObject({
      actorId: admin.id,
      entityId: target.id,
      entity: 'user',
      meta: { from: true, to: false },
    });
    expect(auditRows[0]!.actorId).not.toBe(target.id);
  });

  it('menolak STAFF dan OWNER, dan tidak mengubah apa pun', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('OWNER');

    for (const role of ['STAFF', 'OWNER'] as const) {
      const attacker = await createUser(role);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}/status`)
        .set('Authorization', `Bearer ${attacker.token}`)
        .send({ isActive: false })
        .expect(403);
    }

    // Positive control: aksi yang sama oleh ADMIN berhasil.
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false })
      .expect(200);

    const row = await prisma.users.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.isActive).toBe(false);
  });

  it('menolak body tanpa isActive, dengan nilai bukan boolean, dan field asing', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('OWNER');

    const send = (body: unknown) =>
      request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send(body as object);

    // Tanpa `isActive` tidak boleh berarti "nonaktifkan" maupun default apa pun.
    await send({}).expect(400);
    await send({ isActive: 'nanti' }).expect(400);
    // `role` sengaja tidak boleh bisa diubah lewat endpoint ini.
    await send({ isActive: false, role: 'ADMIN' }).expect(400);

    const row = await prisma.users.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.isActive).toBe(true);
    expect(row.role).toBe('OWNER');
  });

  it('menolak menonaktifkan akun sendiri', async () => {
    // `ADMIN` hanya bisa dibuat lewat seed, jadi admin yang menonaktifkan
    // dirinya sendiri tidak punya jalan kembali lewat API mana pun.
    const admin = await createUser('ADMIN');

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${admin.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false })
      .expect(400);

    expect(res.body.error.code).toBe('SELF_DEACTIVATION_NOT_ALLOWED');
    expect((await prisma.users.findUniqueOrThrow({ where: { id: admin.id } })).isActive).toBe(true);

    // Positive control: admin boleh menyalakan ulang AKUNNYA SENDIRI. Yang
    // dilarang hanya menonaktifkan, karena itu tidak bisa dibatalkan.
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${admin.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('user yang tidak ada ditolak 404', async () => {
    const admin = await createUser('ADMIN');

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${randomUUID()}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false })
      .expect(404);

    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('menonaktifkan akun langsung mencabut refresh token miliknya', async () => {
    // `AuthService.refresh` sudah memeriksa `isActive`, tapi access token yang
    // sudah terbit tetap hidup 15 menit. Mencabut refresh token menutup sisi
    // yang bisa ditutup sekarang.
    const admin = await createUser('ADMIN');
    const target = await createUser('OWNER');

    // Dua, bukan satu: `createUser` mendaftarkan akun (yang sudah menerbitkan
    // sesi lewat `startSession`) DAN login (sesi kedua). Keduanya menghasilkan
    // refresh token aktif, jadi `revokeAllForUser` harus mencabut keduanya.
    // Assertion di sini sengaja menghitung, bukan mengarang angka, supaya test
    // tetap jujur kalau cara pembuatan user berubah.
    const activeBefore = await prisma.refreshTokens.count({
      where: { userId: target.id, revokedAt: null },
    });
    expect(activeBefore).toBe(2);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false })
      .expect(200);

    const remaining = await prisma.refreshTokens.count({
      where: { userId: target.id, revokedAt: null },
    });
    expect(remaining).toBe(0);
  });

  it('nonaktifkan akun tetap terlihat meski penulisan audit gagal (counter naik)', async () => {
    // R-23 melarang kegagalan audit menggagalkan operasi bisnis, dan itu
    // benar - tapi akibatnya adalah "akun dinonaktifkan, sesi dicabut,
    // dan tidak ada yang mencatat itu terjadi". Untuk operasi yang tidak bisa
    // dibatalkan, satu baris `warn` adalah kontrol pengganti yang tipis.
    // Test ini mengunci kontrol penggantinya: penghitung kegagalan naik.
    const admin = await createUser('ADMIN');
    const target = await createUser('OWNER');

    const before = await fetchAuditFailures(admin.token);

    const spy = vi
      .spyOn(prisma.auditLogs, 'create')
      .mockRejectedValue(new Error('audit down'));

    try {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false })
        .expect(200);
    } finally {
      spy.mockRestore();
    }

    // 1. Aksinya benar-benar terjadi, meski auditnya hilang.
    const row = await prisma.users.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.isActive).toBe(false);
    expect(
      await prisma.refreshTokens.count({ where: { userId: target.id, revokedAt: null } }),
    ).toBe(0);

    // 2. Kehilangan jejaknya terlihat.
    expect(await fetchAuditFailures(admin.token)).toBeGreaterThan(before);

    // 3. Dan memang tidak ada baris audit - jadi kondisi ini nyata, bukan
    //    penghitung yang naik tanpa sebab.
    expect(
      await prisma.auditLogs.count({ where: { action: 'admin.user_status_changed' } }),
    ).toBe(0);
  });

  it('akun yang dinonaktifkan tidak bisa login lagi', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('OWNER');

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: target.email, password: VALID_PASSWORD })
      .expect(403);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/stores (dipindah ke AdminService pada task ini)
// ---------------------------------------------------------------------------

describe('GET /admin/stores tetap berperilaku sama', async () => {
  it('ADMIN melihat toko lintas tenant; OWNER tidak', async () => {
    const ownerA = await createUser('OWNER');
    const ownerB = await createUser('OWNER');
    const admin = await createUser('ADMIN');

    const storeA = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${ownerA.token}`)
      .send({ name: 'Toko A' })
      .expect(201);

    const storeB = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${ownerB.token}`)
      .send({ name: 'Toko B' })
      .expect(201);

    const asOwner = await request(app.getHttpServer())
      .get('/api/v1/admin/stores')
      .set('Authorization', `Bearer ${ownerA.token}`)
      .expect(403);
    expect(asOwner.body.error.code).toBe('FORBIDDEN_ROLE');

    const asAdmin = await request(app.getHttpServer())
      .get('/api/v1/admin/stores')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const ids = (asAdmin.body.data as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain(storeA.body.data.id);
    expect(ids).toContain(storeB.body.data.id);
  });

  it('admin yang juga anggota toko tetap perlu keanggotaan untuk data bisnisnya (R-18)', async () => {
    // Admin melihat DAFTAR toko. Membaca DATA toko orang lain tetap harus lewat
    // keanggotaan - daftar platform bukan pintu belakang.
    const owner = await createUser('OWNER');
    const admin = await createUser('ADMIN');

    const store = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Toko Rahasia', city: 'Bandung' })
      .expect(201);

    const denied = await request(app.getHttpServer())
      .get(`/api/v1/stores/${store.body.data.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(403);
    expect(denied.body.error.code).toBe('STORE_FORBIDDEN');
    expect(JSON.stringify(denied.body)).not.toContain('Bandung');

    await prisma.storeMembers.create({
      data: { storeId: store.body.data.id, userId: admin.id, role: 'STAFF' },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/stores/${store.body.data.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
  });
});
