import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import { hasAtLeast } from '../src/stores/store-access.service.js';
import { buildTestApp } from './utils/test-app.js';

/**
 * Suite IDOR (RF-3).
 *
 * Setiap test di sini bertanya hal yang sama dalam bentuk berbeda: "apakah
 * pemanggil hanya bisa menyentuh tokonya sendiri?". Yang diuji adalah MEKANISME
 * - `RolesGuard`, `StoreScopeGuard`, `StoreAccessService.assertAccess`, dan
 * `PrismaService.tenantModel` - bukan logika bisnis endpoint.
 *
 * ## Catatan Task 5
 *
 * Dulunya test "STAFF tidak bisa mengundang", "STAFF tidak bisa escalate
 * role", dan "OWNER A tidak bisa DELETE anggota B" memakai route test-only
 * `/echo/store-ops/*`. Route itu adalah stand-in sementara karena endpoint
 * produksinya belum ada. Sekarang semuanya ada di `src/`, jadi test di sini
 * memanggil endpoint NYATA:
 *
 * - `POST /stores/:storeId/invitations`
 * - `PATCH /stores/:storeId/members/:userId`
 * - `DELETE /stores/:storeId/members/:userId`
 *
 * Yang diuji tetap sama - keputusan "hanya OWNER toko itu yang boleh lewat" -
 * dan sekarang route yang diuji adalah route yang benar-benar dipakai user.
 */
let app: INestApplication;
let prisma: PrismaService;

const VALID_PASSWORD = 'rahasia-kuat-123';

async function resetDatabase(client: PrismaService): Promise<void> {
  // Urutan penghapusan mengikuti dependensi FK.
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

function uniqueEmail(prefix = 'idor'): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

interface TestUser {
  id: string;
  email: string;
  password: string;
  /** Access token yang SUDAH memuat role platform yang benar. */
  token: string;
}

/**
 * Buat user sungguhan (lewat API, bukan seed langsung) lalu login.
 *
 * Login dilakukan SESUDAH role platform diubah, karena `JwtStrategy.validate`
 * membaca role dari claim JWT dan TIDAK cek database. Kalau token diterbitkan
 * sebelum role diubah, test ADMIN akan diam-diam menguji token OWNER.
 */
async function createUser(role: 'ADMIN' | 'OWNER' | 'STAFF' = 'OWNER'): Promise<TestUser> {
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

  return { id: user.id, email, password: VALID_PASSWORD, token: login.body.data.accessToken };
}

/** Buat toko milik `ownerId` dan jadikan `ownerId` OWNER di dalamnya. */
async function createStore(
  ownerId: string,
  overrides: { name?: string; status?: 'ACTIVE' | 'SUSPENDED' } = {},
): Promise<{ id: string; name: string }> {
  const store = await prisma.stores.create({
    data: {
      name: overrides.name ?? `Toko ${randomUUID().slice(0, 8)}`,
      status: overrides.status ?? 'ACTIVE',
      createdById: ownerId,
    },
  });
  await prisma.storeMembers.create({
    data: { storeId: store.id, userId: ownerId, role: 'OWNER' },
  });
  return { id: store.id, name: store.name };
}

function auth(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

// ---------------------------------------------------------------------------
// Guard global: default-deny
// ---------------------------------------------------------------------------

describe('guard global: default-deny', () => {
  it('route tanpa @Public() menolak request tanpa token', async () => {
    await request(app.getHttpServer()).get('/api/v1/stores').expect(401);
    await request(app.getHttpServer()).get('/api/v1/admin/stores').expect(401);
  });

  it('route bertanda @Public() tetap terbuka setelah guard baru dipasang', async () => {
    // R-17: memasang RolesGuard/StoreScopeGuard tidak boleh menutup
    // register/login/refresh/logout/health.
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    const email = uniqueEmail('publik');
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: VALID_PASSWORD, name: 'Tetap Bisa' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(204);
  });
});

// ---------------------------------------------------------------------------
// IDOR
// ---------------------------------------------------------------------------

describe('IDOR', () => {
  it('OWNER toko A tidak bisa GET toko B', async () => {
    const ownerA = await createUser('OWNER');
    const ownerB = await createUser('OWNER');
    const storeA = await createStore(ownerA.id, { name: 'Toko Milik A' });
    const storeB = await createStore(ownerB.id, { name: 'Toko Milik B' });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeB.id}`)
      .set(...auth(ownerA.token))
      .expect(403);

    expect(res.body.error.code).toBe('STORE_FORBIDDEN');
    // Dan response tidak boleh membocorkan data toko B lewat pesan apa pun.
    expect(JSON.stringify(res.body)).not.toContain('Toko Milik B');

    // Positive control: OWNER A tetap bisa GET tokonya sendiri. Kalau ini juga
    // 403, test di atas tidak membuktikan apa pun.
    const own = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeA.id}`)
      .set(...auth(ownerA.token))
      .expect(200);
    expect(own.body.data.id).toBe(storeA.id);
  });

  it('OWNER toko A tidak bisa PATCH toko B', async () => {
    const ownerA = await createUser('OWNER');
    const ownerB = await createUser('OWNER');
    const storeB = await createStore(ownerB.id, { name: 'Toko Milik B' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stores/${storeB.id}`)
      .set(...auth(ownerA.token))
      .send({ name: 'Direbut' })
      .expect(403);
    expect(res.body.error.code).toBe('STORE_FORBIDDEN');

    // Barisnya harus utuh: guard menahan SEBELUM controller menulis apa pun.
    const untouched = await prisma.stores.findUniqueOrThrow({ where: { id: storeB.id } });
    expect(untouched.name).toBe('Toko Milik B');

    // Positive control: OWNER B sendiri boleh mengubah tokonya.
    const ok = await request(app.getHttpServer())
      .patch(`/api/v1/stores/${storeB.id}`)
      .set(...auth(ownerB.token))
      .send({ name: 'Toko Milik B Diubah' })
      .expect(200);
    expect(ok.body.data.name).toBe('Toko Milik B Diubah');
  });

  it('OWNER toko A tidak bisa DELETE anggota toko B', async () => {
    // Diuji lewat endpoint produksi `DELETE /stores/:storeId/members/:userId`.
    // Penghapusan TOKO (`DELETE /stores/:storeId`) tidak punya pemilik di spec/
    // plan dan sudah dihapus pada review; yang diuji di sini tetap Review Focus
    // yang sama - sebuah OWNER tidak bisa menjalankan operasi OWNER-only pada
    // toko orang lain - hanya lewat endpoint yang memang ada di Fase 1.
    const ownerA = await createUser('OWNER');
    const ownerB = await createUser('OWNER');
    const memberB = await createUser('STAFF');
    const storeB = await createStore(ownerB.id);
    await prisma.storeMembers.create({
      data: { storeId: storeB.id, userId: memberB.id, role: 'STAFF' },
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/stores/${storeB.id}/members/${memberB.id}`)
      .set(...auth(ownerA.token))
      .expect(403);
    expect(res.body.error.code).toBe('STORE_FORBIDDEN');

    // Keanggotaan member B harus utuh - guard menahan sebelum delete, bukan
    // sesudahnya.
    const survivor = await prisma.storeMembers.findUniqueOrThrow({
      where: { storeId_userId: { storeId: storeB.id, userId: memberB.id } },
    });
    expect(survivor.role).toBe('STAFF');
    expect(await prisma.storeMembers.count({ where: { storeId: storeB.id } })).toBe(2);

    // Positive control: OWNER B boleh menghapus anggota tokonya sendiri.
    await request(app.getHttpServer())
      .delete(`/api/v1/stores/${storeB.id}/members/${memberB.id}`)
      .set(...auth(ownerB.token))
      .expect(204);
    expect(
      await prisma.storeMembers.count({ where: { storeId: storeB.id } }),
    ).toBe(1);
    expect(
      await prisma.storeMembers.count({ where: { storeId: storeB.id, userId: memberB.id } }),
    ).toBe(0);
  });

  it('ADMIN bukan member toko tidak bisa DELETE anggota toko itu', async () => {
    // Jalur DELETE diuji untuk R-18 juga: ADMIN platform tidak boleh bisa
    // menghapus anggota toko yang bukan miliknya.
    const admin = await createUser('ADMIN');
    const owner = await createUser('OWNER');
    const staff = await createUser('STAFF');
    const store = await createStore(owner.id);
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: staff.id, role: 'STAFF' },
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}/members/${staff.id}`)
      .set(...auth(admin.token))
      .expect(403);
    expect(res.body.error.code).toBe('STORE_FORBIDDEN');
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, userId: staff.id } }),
    ).toBe(1);
  });

  it('tidak ada endpoint produksi untuk menghapus toko', async () => {
    // Penghapusan TOKO adalah authority overrun: tidak ada di spec §6.5, tidak
    // ada di kontrak `StoresService` di plan, `stores` tidak punya soft-delete,
    // dan cascade ke `store_members`/`store_invites` tidak meninggalkan jejak
    // audit sampai Task 6. Test ini mengunci ketiadaannya supaya route itu tidak
    // ditambahkan lagi tanpa keputusan produk.
    const owner = await createUser('OWNER');
    const store = await createStore(owner.id);

    // 404, bukan 403: rutenya memang tidak terdaftar sama sekali, jadi tidak
    // ada filter yang sedang menolak.
    await request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}`)
      .set(...auth(owner.token))
      .expect(404);

    // Dan Positive control: endpoint toko yang ADA tetap berfungsi untuk OWNER,
    // jadi 404 di atas bukan efek samping dari controller yang rusak.
    await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}`)
      .set(...auth(owner.token))
      .send({ name: 'Masih Bisa Diubah' })
      .expect(200);

    // Toko dan keanggotaannya utuh setelah percobaan hapus.
    expect(await prisma.stores.count({ where: { id: store.id } })).toBe(1);
    expect(await prisma.storeMembers.count({ where: { storeId: store.id } })).toBe(1);
  });

  it('OWNER toko A tidak bisa melihat member toko B', async () => {
    const ownerA = await createUser('OWNER');
    const ownerB = await createUser('OWNER');
    const memberB = await createUser('STAFF');
    const storeA = await createStore(ownerA.id);
    const storeB = await createStore(ownerB.id);
    await prisma.storeMembers.create({
      data: { storeId: storeB.id, userId: memberB.id, role: 'STAFF' },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeA.id}/members`)
      .set(...auth(ownerA.token))
      .expect(200);

    // Yang dikunci di sini adalah `PrismaService.tenantModel('storeMembers', ...)`.
    // Guard HANYA membuktikan user adalah member toko A; ia tidak yang
    // menyaring baris mana yang dikembalikan. Tanpa tenantModel, delegate
    // mentah `findMany({})` mengembalikan seluruh membership di database,
    // termasuk anggota toko B. Test positive-control di bawah memastikan
    // endpoint-nya tidak kosong-pecat.
    const emails = (res.body.data as Array<{ user: { email: string } }>).map((m) => m.user.email);
    expect(emails).toEqual([ownerA.email]);
    expect(emails).not.toContain(memberB.email);
    expect(JSON.stringify(res.body)).not.toContain(storeB.id);

    // Positive control: OWNER B melihat anggota tokonya sendiri, termasuk STAFF.
    const own = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeB.id}/members`)
      .set(...auth(ownerB.token))
      .expect(200);
    const ownEmails = (own.body.data as Array<{ user: { email: string } }>).map(
      (m) => m.user.email,
    );
    expect(ownEmails.sort()).toEqual([ownerB.email, memberB.email].sort());
  });

  it('STAFF tidak bisa meng invited anggota lain', async () => {
    const owner = await createUser('OWNER');
    const staff = await createUser('STAFF');
    const store = await createStore(owner.id);
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: staff.id, role: 'STAFF' },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stores/${store.id}/invitations`)
      .set(...auth(staff.token))
      .send({ email: uniqueEmail('undang'), role: 'STAFF' })
      .expect(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');

    // Tidak ada invite yang terbentuk.
    expect(await prisma.storeInvites.count({ where: { storeId: store.id } })).toBe(0);

    // Positive control: OWNER boleh mengundang, jadi 403 di atas datang dari
    // peran, bukan dari route yang selalu menolak.
    await request(app.getHttpServer())
      .post(`/api/v1/stores/${store.id}/invitations`)
      .set(...auth(owner.token))
      .send({ email: uniqueEmail('undang'), role: 'STAFF' })
      .expect(201);
    expect(await prisma.storeInvites.count({ where: { storeId: store.id } })).toBe(1);
  });

  it('STAFF tidak bisa escalate role-nya jadi OWNER', async () => {
    const owner = await createUser('OWNER');
    const staff = await createUser('STAFF');
    const store = await createStore(owner.id);
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: staff.id, role: 'STAFF' },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}/members/${staff.id}`)
      .set(...auth(staff.token))
      .send({ role: 'OWNER' })
      .expect(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');

    // Peran di database tidak berubah sama sekali.
    const still = await prisma.storeMembers.findUniqueOrThrow({
      where: { storeId_userId: { storeId: store.id, userId: staff.id } },
    });
    expect(still.role).toBe('STAFF');

    // Positive control: OWNER boleh mengubah peran. Toko ini punya DUA owner
    // setelah promosi, jadi aturan owner terakhir tidak ikut menyala di sini -
    // yang diuji adalah gerbang `@StoreAccess(OWNER)`.
    await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}/members/${staff.id}`)
      .set(...auth(owner.token))
      .send({ role: 'OWNER' })
      .expect(200);
    const promoted = await prisma.storeMembers.findUniqueOrThrow({
      where: { storeId_userId: { storeId: store.id, userId: staff.id } },
    });
    expect(promoted.role).toBe('OWNER');
  });

  it('STAFF hanya melihat toko yang ditugaskan', async () => {
    const staff = await createUser('STAFF');
    const otherOwner = await createUser('OWNER');
    const storeAssigned = await createStore(otherOwner.id, { name: 'Toko Ditugaskan' });
    await prisma.storeMembers.create({
      data: { storeId: storeAssigned.id, userId: staff.id, role: 'STAFF' },
    });
    const storeOther = await createStore(otherOwner.id, { name: 'Toko Tidak Ditugaskan' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/stores')
      .set(...auth(staff.token))
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(storeAssigned.id);
    expect(JSON.stringify(res.body)).not.toContain(storeOther.id);
    expect(JSON.stringify(res.body)).not.toContain('Toko Tidak Ditugaskan');
  });

  it('ADMIN platform bukan member toko tetap 403', async () => {
    // R-18: admin mengelola platform, bukan data bisnis orang. Dia harus
    // menjadi anggota toko seperti user lain untuk menyentuh data toko itu.
    const admin = await createUser('ADMIN');
    const owner = await createUser('OWNER');
    const store = await createStore(owner.id, { name: 'Toko Swasta' });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/stores/${store.id}`)
      .set(...auth(admin.token))
      .expect(403);
    expect(detail.body.error.code).toBe('STORE_FORBIDDEN');

    await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}`)
      .set(...auth(admin.token))
      .send({ name: 'Direbut Admin' })
      .expect(403);

    // Jalur DELETE diuji terpisah di "ADMIN bukan member toko tidak bisa
    // DELETE anggota toko itu", lewat `DELETE /stores/:storeId/members/:userId`
    // - `DELETE /stores/:storeId` sendiri memang tidak ada di `src/`.

    await request(app.getHttpServer())
      .get(`/api/v1/stores/${store.id}/members`)
      .set(...auth(admin.token))
      .expect(403);

    expect(await prisma.stores.count({ where: { id: store.id } })).toBe(1);
    expect(JSON.stringify(detail.body)).not.toContain('Toko Swasta');

    // Daftar toko milik admin sendiri juga tidak memuat toko orang.
    const list = await request(app.getHttpServer())
      .get('/api/v1/stores')
      .set(...auth(admin.token))
      .expect(200);
    expect(list.body.data).toEqual([]);

    // Positive control: begitu admin jadi MEMBER, aksesnya normal. Ini yang
    // membuktikan penolakan di atas datang dari keanggotaan, bukan dari
    // "ADMIN selalu dilarang".
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: admin.id, role: 'OWNER' },
    });
    const asMember = await request(app.getHttpServer())
      .get(`/api/v1/stores/${store.id}`)
      .set(...auth(admin.token))
      .expect(200);
    expect(asMember.body.data.id).toBe(store.id);
  });

  it('ADMIN bisa melihat daftar toko platform', async () => {
    const admin = await createUser('ADMIN');
    const owner = await createUser('OWNER');
    const storeA = await createStore(owner.id, { name: 'Toko Alpha' });
    const storeB = await createStore(admin.id, { name: 'Toko Beta' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/stores')
      .set(...auth(admin.token))
      .expect(200);

    const ids = (res.body.data as Array<{ id: string }>).map((s) => s.id).sort();
    expect(ids).toEqual([storeA.id, storeB.id].sort());
    expect(res.body.meta.total).toBe(2);

    // Route ADMIN tidak boleh terbuka untuk peran lain - itu yang membuat
    // `@Roles('ADMIN')` bukan hiasan.
    const asOwner = await request(app.getHttpServer())
      .get('/api/v1/admin/stores')
      .set(...auth(owner.token))
      .expect(403);
    expect(asOwner.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('storeId di query string tidak melewati guard', async () => {
    const ownerA = await createUser('OWNER');
    const ownerB = await createUser('OWNER');
    const storeA = await createStore(ownerA.id, { name: 'Toko Asli A' });
    const storeB = await createStore(ownerB.id, { name: 'Toko Rahasia B' });

    // (1) Query storeId tidak menggeser tenant yang dihitung guard: guard
    // membaca `:storeId` dari ROUTE, jadi hasilnya tetap toko A.
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeA.id}?storeId=${storeB.id}`)
      .set(...auth(ownerA.token))
      .expect(200);
    expect(detail.body.data.id).toBe(storeA.id);
    expect(detail.body.data.name).toBe('Toko Asli A');
    expect(JSON.stringify(detail.body)).not.toContain('Toko Rahasia B');

    // (2) Sebaliknya, query tidak bisa "menyelundupkan" otorisasi: route-nya
    // menunjuk toko B, jadi storeId di query tidak menolong sama sekali.
    const smuggled = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeB.id}?storeId=${storeA.id}`)
      .set(...auth(ownerA.token))
      .expect(403);
    expect(smuggled.body.error.code).toBe('STORE_FORBIDDEN');

    // (3) Daftar toko juga mengabaikan `?storeId=` - sumber kebocoran yang paling
    // mudah terjadi kalau service memakai input client apa adanya.
    const list = await request(app.getHttpServer())
      .get(`/api/v1/stores?storeId=${storeB.id}`)
      .set(...auth(ownerA.token))
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(storeA.id);
    expect(JSON.stringify(list.body)).not.toContain(storeB.id);

    // (4) Route tanpa `:storeId` tapi dengan body `storeId` juga tidak
    // melewati apa pun - minuskul tidak punya handler, jadi 404.
    await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeA.id}/invitations?storeId=${storeB.id}`)
      .set(...auth(ownerB.token))
      .send({ email: uniqueEmail('x'), role: 'STAFF' })
      .expect(403);
  });
});

// ---------------------------------------------------------------------------
// Status toko dan hierarki peran
// ---------------------------------------------------------------------------

describe('assertAccess: status toko dan hierarki peran', () => {
  it('member toko SUSPENDED mendapat STORE_SUSPENDED, bukan STORE_FORBIDDEN', async () => {
    const owner = await createUser('OWNER');
    const store = await createStore(owner.id, { status: 'SUSPENDED' });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/stores/${store.id}`)
      .set(...auth(owner.token))
      .expect(403);
    expect(res.body.error.code).toBe('STORE_SUSPENDED');
  });

  it('STAFF tidak boleh memakai route OWNER-only pada toko yang sama', async () => {
    const owner = await createUser('OWNER');
    const staff = await createUser('STAFF');
    const store = await createStore(owner.id);
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: staff.id, role: 'STAFF' },
    });

    // Membaca tetap boleh - hanya keanggotaan yang dicek.
    await request(app.getHttpServer())
      .get(`/api/v1/stores/${store.id}`)
      .set(...auth(staff.token))
      .expect(200);

    // Menulis tidak.
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}`)
      .set(...auth(staff.token))
      .send({ name: 'Nama Baru' })
      .expect(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('R-17: guard peran dijalankan SEBELUM guard toko', async () => {
    // Rute `GET /echo/guard-order/:storeId` memakai `@Roles('ADMIN')` DAN
    // `@StoreAccess()` sekaligus - satu-satunya cara mengukur urutan rantai
    // dari luar.
    //
    // CARA PENGUKURANNYA: pemanggil harus GAGAL pada KEDUA pemeriksaan. Kalau
    // hanya gagal satu, guard yang menang selalu sama walau urutannya dibalik,
    // dan tesnya jadi buta urutan - persis kelemahan yang ditemukan di review.
    // Jadi sub-kasus (a) memakai user yang bukan ADMIN (gagal `RolesGuard`) DAN
    // bukan member toko target (gagal `StoreScopeGuard`) pada saat bersamaan.
    // Kode error yang sampai ke client menjadi:
    //   - `FORBIDDEN_ROLE`    -> `RolesGuard` berjalan lebih dulu (urutan R-17)
    //   - `STORE_FORBIDDEN`   -> `StoreScopeGuard` berjalan lebih dulu (terbalik)
    const ownerOfA = await createUser('OWNER');
    const stranger = await createUser('OWNER');
    const admin = await createUser('ADMIN');
    const store = await createStore(ownerOfA.id);

    // `stranger` tidak punya membership apa pun terhadap `store`.
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, userId: stranger.id } }),
    ).toBe(0);

    const denied = await request(app.getHttpServer())
      .get(`/api/v1/echo/guard-order/${store.id}`)
      .set(...auth(stranger.token))
      .expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN_ROLE');

    // Positive control: pemanggil yang memenuhi KEDUA syarat - ADMIN yang juga
    // member toko target - harus benar-benar lolos. Tanpa ini, `403` di atas
    // bisa juga terjadi karena route-nya rusak, bukan karena urutannya.
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: admin.id, role: 'STAFF' },
    });
    const allowed = await request(app.getHttpServer())
      .get(`/api/v1/echo/guard-order/${store.id}`)
      .set(...auth(admin.token))
      .expect(200);
    expect(allowed.body.storeId).toBe(store.id);
    expect(allowed.body.userId).toBe(admin.id);
  });

  it('R-17: kedua guard terdaftar dan sama-sama efektif (bukan pengukur urutan)', async () => {
    // Dipisah dari tes di atas dengan sengaja. Tes ini TIDAK bisa membedakan
    // urutan: (a) hanya gagal satu guard, (b) hanya gagal guard yang lain.
    // Yang diukurnya adalah hal yang lebih lemah tapi benar: kedua guard
    // terdaftar sebagai `APP_GUARD` dan masing-masing benar-benar menolak.
    const owner = await createUser('OWNER');
    const admin = await createUser('ADMIN');
    const store = await createStore(owner.id);

    // (a) OWNER yang jadi member: lolos `StoreScopeGuard`, ditolak `RolesGuard`.
    const byRole = await request(app.getHttpServer())
      .get(`/api/v1/echo/guard-order/${store.id}`)
      .set(...auth(owner.token))
      .expect(403);
    expect(byRole.body.error.code).toBe('FORBIDDEN_ROLE');

    // (b) ADMIN yang BUKAN member: lolos `RolesGuard`, ditolak `StoreScopeGuard`.
    const byScope = await request(app.getHttpServer())
      .get(`/api/v1/echo/guard-order/${store.id}`)
      .set(...auth(admin.token))
      .expect(403);
    expect(byScope.body.error.code).toBe('STORE_FORBIDDEN');
  });

  it('hasAtLeast: OWNER >= STAFF, dan minimum kosong berarti bebas', () => {
    expect(hasAtLeast('OWNER')).toBe(true);
    expect(hasAtLeast('STAFF')).toBe(true);
    expect(hasAtLeast('STAFF', 'STAFF')).toBe(true);
    expect(hasAtLeast('OWNER', 'STAFF')).toBe(true);
    expect(hasAtLeast('STAFF', 'OWNER')).toBe(false);
    // Peran di luar hierarki ditolak, bukan dianggap cukup.
    expect(hasAtLeast('ADMIN' as never, 'STAFF')).toBe(false);
  });
});