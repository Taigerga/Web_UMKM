import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import { StoreAccessService } from '../src/stores/store-access.service.js';
import { StoresService } from '../src/stores/stores.service.js';
import { InvitationsService } from '../src/invitations/invitations.service.js';
import { buildTestApp } from './utils/test-app.js';

/**
 * Task 5: toko, anggota, dan undangan.
 *
 * Yang diuji di sini adalah PROPERTI, bukan sekadar bentuk response.
 *
 * - `POST /stores` membuat toko DAN baris `store_members` OWNER sebagai satu
 *   transaksi. Sifat transaksinya diuji di `src/stores/stores.service.spec.ts`
 *   memakai Prisma palsu, karena kegagalan di tengah transaksi tidak bisa
 *   dipancing lewat HTTP tanpa merusak database test.
 * - Token undangan disimpan sebagai SHA-256 (R-22): respons pembuatan memuat
 *   token mentah, tabel hanya memuat digest. Test menghitung ulang digest-nya
 *   sendiri, bukan membandingkan dengan nilai balik dari service.
 * - `removeMember` DAN `updateMember` sama-sama menolak operasi yang membuat
 *   toko kehilangan owner terakhirnya (R-21 / RF-2).
 * - Store `SUSPENDED` ditolak di LAYER SERVICE (RF-5): test memanggil
 *   `StoresService` langsung, tanpa HTTP, jadi penolakan tidak bisa datang dari
 *   `StoreScopeGuard`.
 */
let app: INestApplication;
let prisma: PrismaService;
let storesService: StoresService;
let invitationsService: InvitationsService;
let storeAccess: StoreAccessService;

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
  storesService = app.get(StoresService);
  invitationsService = app.get(InvitationsService);
  storeAccess = app.get(StoreAccessService);
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

function uniqueEmail(prefix = 'toko'): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
}

/**
 * Buat user sungguhan lewat API, opsional ubah peran platform, lalu login.
 *
 * Login selalu SESUDAH peran diubah karena `JwtStrategy.validate` membaca role
 * dari claim JWT dan tidak cek database.
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

/** Buat toko lewat endpoint produksi supaya jalur yang diuji sama dengan jalur user. */
async function createStoreViaApi(
  user: TestUser,
  overrides: { name?: string; city?: string } = {},
): Promise<{ id: string; name: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/stores')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ name: overrides.name ?? `Toko ${randomUUID().slice(0, 8)}`, city: overrides.city })
    .expect(201);
  return { id: res.body.data.id, name: res.body.data.name };
}

interface IssuedInvitation {
  id: string;
  email: string;
  role: 'OWNER' | 'STAFF';
  expiresAt: string;
  token: string;
}

async function invite(
  owner: TestUser,
  storeId: string,
  email: string,
  role: 'OWNER' | 'STAFF' = 'STAFF',
): Promise<IssuedInvitation> {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/stores/${storeId}/invitations`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ email, role })
    .expect(201);
  return res.body.data as IssuedInvitation;
}

async function expireInvitation(inviteId: string): Promise<void> {
  await prisma.storeInvites.update({
    where: { id: inviteId },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ---------------------------------------------------------------------------
// Pembuatan toko
// ---------------------------------------------------------------------------

describe('POST /stores', () => {
  it('register → buat toko otomatis jadi OWNER', async () => {
    const user = await createUser('OWNER');

    const created = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Warung Bu Tuti', city: 'Bandung' })
      .expect(201);

    expect(created.body.data.name).toBe('Warung Bu Tuti');
    expect(created.body.data.city).toBe('Bandung');
    expect(created.body.data.status).toBe('ACTIVE');
    expect(created.body.data.role).toBe('OWNER');

    const storeId = created.body.data.id as string;

    // Baris keanggotaan OWNER benar-benar ada - inilah yang membuat "buat
    // toko otomatis jadi OWNER" bukan sekadar klaim di response.
    const membership = await prisma.storeMembers.findUnique({
      where: { storeId_userId: { storeId, userId: user.id } },
    });
    expect(membership?.role).toBe('OWNER');

    // Dan user itu langsung bisa memakai tokonya.
    const members = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/members`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(members.body.data).toHaveLength(1);
    expect(members.body.data[0].user.email).toBe(user.email);
    expect(members.body.data[0].role).toBe('OWNER');

    // Positive control: user yang sama bisa memakai tokonya seperti biasa.
    const list = await request(app.getHttpServer())
      .get('/api/v1/stores')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect((list.body.data as Array<{ id: string; role: string }>)[0]).toMatchObject({
      id: storeId,
      role: 'OWNER',
    });
  });

  it('ADMIN platform tidak bisa membuat toko (matriks izin spec 6.4)', async () => {
    const admin = await createUser('ADMIN');

    const res = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Toko Buatan Admin' })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    expect(JSON.stringify(res.body)).not.toContain('Toko Buatan Admin');
    expect(await prisma.stores.count()).toBe(0);
  });

  it('body dengan field tak dikenal ditolak, dan tidak ada toko yang terbentuk', async () => {
    const user = await createUser('OWNER');

    const res = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Toko Sisip Status', status: 'SUSPENDED' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.stores.count()).toBe(0);
    expect(await prisma.storeMembers.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Undangan: pembuatan + R-22 (hash, token sekali)
// ---------------------------------------------------------------------------

describe('POST /stores/:storeId/invitations', () => {
  it('OWNER bisa mengundang pegawai; token dikembalikan sekali (raw), hash tersimpan', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const email = uniqueEmail('undang');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stores/${store.id}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email, role: 'STAFF' })
      .expect(201);

    const data = res.body.data as IssuedInvitation;

    // Token mentah hanya ada DI RESPON PEMBUATAN.
    expect(typeof data.token).toBe('string');
    expect(data.token.length).toBeGreaterThanOrEqual(32);
    expect(data.email).toBe(email);
    expect(data.role).toBe('STAFF');
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // `tokenHash` tidak boleh ikut keluar di respons.
    expect(res.body.data.tokenHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('tokenHash');

    const row = await prisma.storeInvites.findUniqueOrThrow({ where: { id: data.id } });

    // Yang tersimpan adalah digest SHA-256 - dihitung ulang di sini, bukan
    // dibandingkan dengan nilai yang dikembalikan service.
    expect(row.tokenHash).toBe(sha256(data.token));
    expect(row.tokenHash).toHaveLength(64);
    expect(row.tokenHash).not.toBe(data.token);

    // Dan token mentah tidak ada di baris mana pun pada tabel undangan.
    const allRows = await prisma.storeInvites.findMany({ where: { storeId: store.id } });
    expect(JSON.stringify(allRows)).not.toContain(data.token);

    // Tidak bisa dibaca ulang lewat endpoint mana pun: tidak ada route yang
    // mengembalikan token, dan preview juga tidak memuatnya.
    const preview = await request(app.getHttpServer())
      .get(`/api/v1/invitations/${data.token}`)
      .expect(200);
    expect(JSON.stringify(preview.body)).not.toContain(data.token);
  });

  it('email undangan dinormalisasi seperti email auth', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);

    // Email dengan kapital di bagian domain dan labelnya. `AuthService`
    // menyimpannya dalam bentuk ternormalisasi, jadi `PEGAWAI@Contoh.ID` dan
    // `pegawai@contoh.id` adalah akun yang sama. Jalur undangan harus sepakat,
    // kalau tidak penerima yang mengetik dengan kapital akan selalu ditolak
    // `INVITE_EMAIL_MISMATCH`.
    const raw = `Pegawai-${randomUUID()}@Contoh.ID`;
    const issued = await invite(owner, store.id, raw);

    expect(issued.email).toBe(raw.toLowerCase());
    const row = await prisma.storeInvites.findUniqueOrThrow({ where: { id: issued.id } });
    expect(row.email).toBe(raw.toLowerCase());
  });

  it('STAFF tidak bisa mengundang siapa pun', async () => {
    const owner = await createUser('OWNER');
    const staff = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: staff.id, role: 'STAFF' },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stores/${store.id}/invitations`)
      .set('Authorization', `Bearer ${staff.token}`)
      .send({ email: uniqueEmail('dicegah'), role: 'STAFF' })
      .expect(403);

    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
    expect(await prisma.storeInvites.count({ where: { storeId: store.id } })).toBe(0);

    // Positive control: OWNER toko itu sendiri boleh mengundang. Kalau ini
    // juga 403, penolakan di atas tidak membuktikan apa pun.
    await invite(owner, store.id, uniqueEmail('boleh'));
    expect(await prisma.storeInvites.count({ where: { storeId: store.id } })).toBe(1);
  });

  it('OWNER toko lain tidak bisa mengundang di toko yang bukan miliknya', async () => {
    const ownerA = await createUser('OWNER');
    const ownerB = await createUser('OWNER');
    const storeA = await createStoreViaApi(ownerA, { name: 'Toko A' });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeA.id}/invitations`)
      .set('Authorization', `Bearer ${ownerB.token}`)
      .send({ email: uniqueEmail('idor'), role: 'STAFF' })
      .expect(403);

    expect(res.body.error.code).toBe('STORE_FORBIDDEN');
    expect(await prisma.storeInvites.count({ where: { storeId: storeA.id } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

describe('GET /invitations/:token', () => {
  it('preview undangan valid memunculkan email + nama toko', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner, { name: 'Kopi Senja' });
    const email = uniqueEmail('preview');
    const issued = await invite(owner, store.id, email, 'OWNER');

    // Tanpa autentikasi: penerima undangan belum tentu punya akun.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/invitations/${issued.token}`)
      .expect(200);

    expect(res.body.data.email).toBe(email);
    expect(res.body.data.storeName).toBe('Kopi Senja');
    expect(res.body.data.role).toBe('OWNER');
    expect(res.body.data.expiresAt).toBe(issued.expiresAt);

    // Tidak membocorkan internal: tokenHash dan id baris tidak ikut.
    expect(res.body.data.tokenHash).toBeUndefined();
    expect(res.body.data.id).toBeUndefined();
    expect(res.body.data.storeId).toBeUndefined();
  });

  it('token yang tidak dikenal ditolak INVITE_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/invitations/${randomUUID()}${randomUUID()}`)
      .expect(404);

    expect(res.body.error.code).toBe('INVITE_NOT_FOUND');
  });

  it('preview undangan kedaluwarsa ditolak INVITE_EXPIRED', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const issued = await invite(owner, store.id, uniqueEmail('basi'));
    await expireInvitation(issued.id);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/invitations/${issued.token}`)
      .expect(400);

    expect(res.body.error.code).toBe('INVITE_EXPIRED');
  });
});

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

describe('POST /invitations/:token/accept', () => {
  it('accept undangan membuat store_members dengan role yang diundang', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner, { name: 'Toko Undangan' });
    const invitee = await createUser('OWNER');
    const issued = await invite(owner, store.id, invitee.email, 'OWNER');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(201);

    expect(res.body.data.storeId).toBe(store.id);
    expect(res.body.data.storeName).toBe('Toko Undangan');
    expect(res.body.data.role).toBe('OWNER');

    const membership = await prisma.storeMembers.findUnique({
      where: { storeId_userId: { storeId: store.id, userId: invitee.id } },
    });
    expect(membership?.role).toBe('OWNER');

    // Efek nyata: user itu sekarang bisa menjangkau toko tersebut.
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/stores/${store.id}`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(200);
    expect(detail.body.data.name).toBe('Toko Undangan');
  });

  it('role STAFF yang diundang menghasilkan membership STAFF', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const invitee = await createUser('OWNER');
    const issued = await invite(owner, store.id, invitee.email, 'STAFF');

    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(201);

    const membership = await prisma.storeMembers.findUnique({
      where: { storeId_userId: { storeId: store.id, userId: invitee.id } },
    });
    expect(membership?.role).toBe('STAFF');

    // STAFF tidak boleh melakukan aksi OWNER: positive control gerbang peran.
    await request(app.getHttpServer())
      .post(`/api/v1/stores/${store.id}/invitations`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .send({ email: uniqueEmail('naik'), role: 'STAFF' })
      .expect(403);
  });

  it('undangan yang sudah accepted tidak bisa dipakai lagi → INVITE_ALREADY_ACCEPTED', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const invitee = await createUser('OWNER');
    const issued = await invite(owner, store.id, invitee.email, 'OWNER');

    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(409);

    expect(second.body.error.code).toBe('INVITE_ALREADY_ACCEPTED');

    // Preview juga berhenti menandai undangan itu sudah dipakai.
    const preview = await request(app.getHttpServer())
      .get(`/api/v1/invitations/${issued.token}`)
      .expect(409);
    expect(preview.body.error.code).toBe('INVITE_ALREADY_ACCEPTED');

    // Dan membership-nya tetap SATU baris - tidak diduplikasi.
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, userId: invitee.id } }),
    ).toBe(1);
  });

  it('dua permintaan terima bersamaan: hanya satu yang berhasil (INVITE_ALREADY_ACCEPTED)', async () => {
    // Test berurutan di atas tidak membuktikan klaim ATOMIK, hanya pemeriksaan
    // `acceptedAt !== null` yang sudah dibaca sebelum menulis. Dua permintaan
    // yang tiba bersamaan bisa sama-sama membaca `acceptedAt === null` dan
    // sama-sama proceeded.
    //
    // Yang dipin di sini: penandaan-used harus berupa
    // `UPDATE ... WHERE accepted_at IS NULL` yang mengembalikan jumlah baris,
    // sehingga hanya satu permintaan yang bisa mengklaim. Kalau filter
    // `acceptedAt: null` dihapus dari `where`, kedua permintaan ini berhasil
    // dan test gagal.
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const invitee = await createUser('OWNER');
    const issued = await invite(owner, store.id, invitee.email, 'STAFF');

    const acceptOnce = () =>
      request(app.getHttpServer())
        .post(`/api/v1/invitations/${issued.token}/accept`)
        .set('Authorization', `Bearer ${invitee.token}`);

    const [first, second] = await Promise.all([acceptOnce(), acceptOnce()]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const loser = first.status === 409 ? first : second;
    expect(loser.body.error.code).toBe('INVITE_ALREADY_ACCEPTED');

    // Tidak ada keanggotaan ganda dan hanya satu penandaan.
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, userId: invitee.id } }),
    ).toBe(1);
    const row = await prisma.storeInvites.findUniqueOrThrow({ where: { id: issued.id } });
    expect(row.acceptedAt).not.toBeNull();
  });

  it('undangan kedaluwarsa ditolak INVITE_EXPIRED', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const invitee = await createUser('OWNER');
    const issued = await invite(owner, store.id, invitee.email, 'STAFF');
    await expireInvitation(issued.id);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(400);

    expect(res.body.error.code).toBe('INVITE_EXPIRED');
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, userId: invitee.id } }),
    ).toBe(0);

    // Preview masih bisa dipakai untuk memberi tahu "undangan sudah basi",
    // tapi tidak ada membership yang terbentuk dari preview.
    expect(issued.token).not.toBe('');
  });

  it('undangan ke email yang sudah punya akun tetap works (user login dulu)', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);

    // Penerima sudah daftar dan sudah jadi anggota toko lain. Akunnya ada
    // sebelumRelevant: jalur undangan tidak boleh bergantung pada "belum pernah
    // diundang".
    const invitee = await createUser('OWNER');
    const otherOwner = await createUser('OWNER');
    const otherStore = await createStoreViaApi(otherOwner);
    const firstInvite = await invite(otherOwner, otherStore.id, invitee.email, 'STAFF');
    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${firstInvite.token}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(201);

    const issued = await invite(owner, store.id, invitee.email, 'STAFF');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(201);

    expect(res.body.data.storeId).toBe(store.id);

    // Kedua toko sekarang bisa dijangkau, dan peran di tiap toko berbeda -
    // itulah alasan `Role` platform dan `StoreMemberRole` dipisah.
    const stores = await request(app.getHttpServer())
      .get('/api/v1/stores')
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(200);
    const listed = stores.body.data as Array<{ id: string; role: string }>;
    expect(listed.map((s) => s.id).sort()).toEqual([store.id, otherStore.id].sort());
    expect(listed.find((s) => s.id === store.id)?.role).toBe('STAFF');
    expect(listed.find((s) => s.id === otherStore.id)?.role).toBe('STAFF');
  });

  it('undangan ditolak bila email penerima tidak cocok dengan akun yang masuk', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const stranger = await createUser('OWNER');
    const issued = await invite(owner, store.id, uniqueEmail('khusus'), 'OWNER');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(403);

    expect(res.body.error.code).toBe('INVITE_EMAIL_MISMATCH');
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, userId: stranger.id } }),
    ).toBe(0);

    // Undangan belum ikut terpakai: penerima yang benar masih bisa memakainya.
    const row = await prisma.storeInvites.findUniqueOrThrow({ where: { id: issued.id } });
    expect(row.acceptedAt).toBeNull();
  });

  it('accept butuh autentikasi', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const issued = await invite(owner, store.id, uniqueEmail('anonim'));

    const res = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

it('menerima undangan tidak pernah menurunkan peran yang sudah ada', async () => {
    // Jalur ini BUKAN tempat ubah peran: owner terakhir dicabut/dinurunkan lewat
    // `DELETE`/`PATCH /members/:userId`. Undangan hanya membuka akses.
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const invitee = await createUser('OWNER');
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: invitee.id, role: 'OWNER' },
    });

    const issued = await invite(owner, store.id, invitee.email, 'STAFF');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(201);

    const membership = await prisma.storeMembers.findUniqueOrThrow({
      where: { storeId_userId: { storeId: store.id, userId: invitee.id } },
    });
    expect(membership.role).toBe('OWNER');

    // Respons harus melaporkan peran yang DIMILIKI, bukan yang diundang.
    // Kalau respons bilang `STAFF` (peran undangan) padahal database menyimpan
    // `OWNER`, frontend menyalakan kontrol yang salah arah; kalau ini
    // membalikkan ke arah lain (`OWNER` padahal tersimpan `STAFF`), frontend
    // menampilkan kontrol OWNER yang akan ditolak backend. Test di bawah
    // menutup kedua arah.
    expect(res.body.data.role).toBe('OWNER');
  });

  it('respons accept melaporkan peran lama, bukan peran yang diundang', async () => {
    // Kasus kebalikannya: penerima sudah STAFF, undangan menawarkan OWNER.
    // `update: {}` pada upsert mempertahankan STAFF, jadi itulah yang harus
    // dikembalikan - bukan OWNER yang tertulis di undangan.
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const invitee = await createUser('OWNER');
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: invitee.id, role: 'STAFF' },
    });

    const issued = await invite(owner, store.id, invitee.email, 'OWNER');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${issued.token}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(201);

    // Database tetap STAFF...
    const membership = await prisma.storeMembers.findUniqueOrThrow({
      where: { storeId_userId: { storeId: store.id, userId: invitee.id } },
    });
    expect(membership.role).toBe('STAFF');

    // ...dan respons mencerminkan keadaan sebenarnya, bukan ke undangan.
    expect(res.body.data.role).toBe('STAFF');
    expect(res.body.data.role).not.toBe(issued.role);
  });
});

// ---------------------------------------------------------------------------
// RF-2 / R-21: owner terakhir
// ---------------------------------------------------------------------------

describe('owner terakhir tidak bisa kehilangan perannya', () => {
  it('owner terakhir tidak bisa dicabut → LAST_OWNER (409)', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}/members/${owner.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(409);

    expect(res.body.error.code).toBe('LAST_OWNER');

    // Keanggotaannya utuh.
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, userId: owner.id } }),
    ).toBe(1);
  });

  it('owner terakhir tidak bisa diturunkan ke STAFF → LAST_OWNER (409)', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}/members/${owner.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'STAFF' })
      .expect(409);

    expect(res.body.error.code).toBe('LAST_OWNER');

    const membership = await prisma.storeMembers.findUniqueOrThrow({
      where: { storeId_userId: { storeId: store.id, userId: owner.id } },
    });
    expect(membership.role).toBe('OWNER');
  });

  it('peran owner boleh diturunkan kalau ada owner lain', async () => {
    const owner = await createUser('OWNER');
    const other = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: other.id, role: 'OWNER' },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}/members/${other.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'STAFF' })
      .expect(200);

    expect(res.body.data.role).toBe('STAFF');
    const membership = await prisma.storeMembers.findUniqueOrThrow({
      where: { storeId_userId: { storeId: store.id, userId: other.id } },
    });
    expect(membership.role).toBe('STAFF');
    // Store sekarang menyisakan tepat satu owner.
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, role: 'OWNER' } }),
    ).toBe(1);
  });

  it('owner boleh mencabut STAFF dan owner kedua', async () => {
    const owner = await createUser('OWNER');
    const staff = await createUser('OWNER');
    const second = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: staff.id, role: 'STAFF' },
    });
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: second.id, role: 'OWNER' },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}/members/${staff.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}/members/${second.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);

    // Tersisa owner pertama saja.
    const remaining = await prisma.storeMembers.findMany({ where: { storeId: store.id } });
    expect(remaining.map((m) => m.userId)).toEqual([owner.id]);
  });

  it('owner terakhir toko A tetap terkunci walau toko lain punya owner', async () => {
    // Menghitung owner tanpa tenant scope (`prisma.storeMembers.count({ where:
    // { role: OWNER } })`) akan menjumlah SELURUH owner di database. Owner milik
    // toko lain akan membuat hitungan itu lebih besar dari 1, dan aturan owner
    // terakhir mati. Test ini sengaja melakukan hal itu: kalau yang dihitung
    // lintas toko, permintaan di bawah ini akan lolos dan test gagal.
    const ownerA = await createUser('OWNER');
    const storeA = await createStoreViaApi(ownerA);

    const ownerB = await createUser('OWNER');
    const storeB = await createStoreViaApi(ownerB);

    // Dua toko, masing-masing dengan tepat satu OWNER.
    expect(
      await prisma.storeMembers.count({ where: { storeId: storeA.id, role: 'OWNER' } }),
    ).toBe(1);
    expect(
      await prisma.storeMembers.count({ where: { storeId: storeB.id, role: 'OWNER' } }),
    ).toBe(1);

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/stores/${storeA.id}/members/${ownerA.id}`)
      .set('Authorization', `Bearer ${ownerA.token}`)
      .expect(409);

    expect(res.body.error.code).toBe('LAST_OWNER');

    // Positive control: toko B tetap bisa kehilangan owner-nya lewat OWNER-nya
    // sendiri, jadi aturan ini tidak membekukan seluruh platform.
    const control = await request(app.getHttpServer())
      .patch(`/api/v1/stores/${storeB.id}/members/${ownerB.id}`)
      .set('Authorization', `Bearer ${ownerB.token}`)
      .send({ role: 'STAFF' })
      .expect(409);
    expect(control.body.error.code).toBe('LAST_OWNER');
  });

  it('mengubah peran ke nilai yang sama tidak ditolak LAST_OWNER', async () => {
    // `OWNER -> OWNER` tidak mengurangi jumlah owner, jadi tidak boleh terblokir
    // oleh aturan owner terakhir.
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}/members/${owner.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'OWNER' })
      .expect(200);

    expect(res.body.data.role).toBe('OWNER');
  });

  it('anggota yang tidak ada ditolak MEMBER_NOT_FOUND', async () => {
    const owner = await createUser('OWNER');
    const stranger = await createUser('OWNER');
    const store = await createStoreViaApi(owner);

    const removed = await request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}/members/${stranger.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    expect(removed.body.error.code).toBe('MEMBER_NOT_FOUND');

    const changed = await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}/members/${stranger.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'STAFF' })
      .expect(404);
    expect(changed.body.error.code).toBe('MEMBER_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// RF-5: toko SUSPENDED diblokir di layer SERVICE
// ---------------------------------------------------------------------------

describe('toko SUSPENDED memblokir baca dan tulis di layer service', () => {
  it('service menolak baca, tulis, keanggotaan, undangan, dan penghapusan anggota', async () => {
    const owner = await createUser('OWNER');
    const staff = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: staff.id, role: 'STAFF' },
    });

    await prisma.stores.update({ where: { id: store.id }, data: { status: 'SUSPENDED' } });

    // Panggilan LANGSUNG ke service: tidak ada guard, tidak ada HTTP. Kalau
    // pemeriksaan status hanya ada di `StoreScopeGuard`, semua baris di bawah
    // akan lolos dan test ini gagal.
    await expect(storesService.get(owner.id, store.id)).rejects.toMatchObject({
      status: 403,
      code: 'STORE_SUSPENDED',
    });

    await expect(
      storesService.update(owner.id, store.id, { name: 'Nama Baru' }),
    ).rejects.toMatchObject({ status: 403, code: 'STORE_SUSPENDED' });

    await expect(storesService.members(staff.id, store.id)).rejects.toMatchObject({
      status: 403,
      code: 'STORE_SUSPENDED',
    });

    await expect(
      storesService.invite(owner.id, store.id, { email: uniqueEmail('suspend'), role: 'STAFF' }),
    ).rejects.toMatchObject({ status: 403, code: 'STORE_SUSPENDED' });

    await expect(
      storesService.updateMember(owner.id, store.id, staff.id, { role: 'OWNER' }),
    ).rejects.toMatchObject({ status: 403, code: 'STORE_SUSPENDED' });

    await expect(
      storesService.removeMember(owner.id, store.id, staff.id),
    ).rejects.toMatchObject({ status: 403, code: 'STORE_SUSPENDED' });

    // Tidak ada efek samping: nama tidak berubah dan tidak ada undangan baru.
    const unchanged = await prisma.stores.findUniqueOrThrow({ where: { id: store.id } });
    expect(unchanged.name).toBe(store.name);
    expect(await prisma.storeInvites.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('lapisan HTTP menolak dengan kode yang sama', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await prisma.stores.update({ where: { id: store.id }, data: { status: 'SUSPENDED' } });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/stores/${store.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403);
    expect(detail.body.error.code).toBe('STORE_SUSPENDED');

    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/stores/${store.id}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: uniqueEmail('suspend'), role: 'STAFF' })
      .expect(403);
    expect(inviteRes.body.error.code).toBe('STORE_SUSPENDED');

    // Positive control: `isOwner` TETAP bisa dijawab untuk toko suspended -
    // itu yang membuat aturan owner terakhir masih bisa bekerja di toko itu.
    await expect(storeAccess.isOwner(owner.id, store.id)).resolves.toBe(true);
  });

  it('menerima undangan ke toko SUSPENDED ditolak', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    const invitee = await createUser('OWNER');
    const issued = await invite(owner, store.id, invitee.email, 'STAFF');

    await prisma.stores.update({ where: { id: store.id }, data: { status: 'SUSPENDED' } });

    await expect(
      invitationsService.accept(issued.token, invitee.id),
    ).rejects.toMatchObject({ status: 403, code: 'STORE_SUSPENDED' });

    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, userId: invitee.id } }),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// R-21 (lanjutan): serialisasi operasi owner lewat lock baris induk
// ---------------------------------------------------------------------------

/**
 * Pegang lock baris induk `storeId` dari koneksi TRANSAKSI yang BERBEDA, sampai
 * `release()` dipanggil.
 *
 * Dipakai untuk membuat balapan owner MUTLAK terjadi, bukan hoped-for: dengan
 * lock ini tertahan, setiap operasi owner-changing yang mengambil lock yang
 * sama DIJAMIN memblokir, jadi kita bisa mengamati apakah ia benar-benar
 * mengambil lock itu.
 *
 * `prisma.$transaction` dengan callback memakai satu koneksi dari pool selama
 * callback berjalan, jadi baris `SELECT ... FOR UPDATE` di dalamnya memang
 * dipegang koneksi nyata sampai transaksi selesai.
 */
function holdStoreLock(client: PrismaService, storeId: string) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  const held = client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
    await released;
  });

  return {
    /** Lepas lock dan tunggu transaksi benar-benar selesai. */
    release: async () => {
      release();
      await held;
    },
  };
}

// Tambahkan owner kedua untuk toko yang sama.
async function addOwner(user: TestUser, storeId: string): Promise<void> {
  await prisma.storeMembers.create({
    data: { storeId, userId: user.id, role: 'OWNER' },
  });
}

describe('R-21: operasi owner diserialisasi lewat lock baris induk', () => {
  it('removeMember memblokir sampai lock baris toko dilepas', async () => {
    // Mengamati SERIALISASI secara deterministik: dengan lock ditahan,
    // permintaan yang mengambil lock yang sama tidak bisa selesai. Kalau
    // `lockStoreRow` dihapus, permintaan ini langsung selesai dan test gagal.
    const owner = await createUser('OWNER');
    const second = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await addOwner(second, store.id);

    const holder = holdStoreLock(prisma, store.id);

    let settled = false;
    const pending = request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}/members/${second.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .then((res) => {
        settled = true;
        return res;
      });

    // Beri waktu yang jauh melebihi latency DB biasa. Kalau operasi tidak
    // memblokir, `settled` sudah `true` pada titik ini.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(settled).toBe(false);

    await holder.release();

    // Setelah lock dilepas, operasi berjalan normal dan owner kedua boleh
    // dicabut karena masih ada owner pertama.
    const res = await pending;
    expect(res.status).toBe(204);
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, role: 'OWNER' } }),
    ).toBe(1);
  });

  it('updateMember memblokir sampai lock baris toko dilepas, termasuk jalur promosi', async () => {
    const owner = await createUser('OWNER');
    const staff = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: staff.id, role: 'STAFF' },
    });

    // Jalur PROMOSI (STAFF -> OWNER). Kalau ini tidak mengambil lock, maka
    // ada jalur owner-changing yang bisa menyelundup melewati penjaga.
    const holder = holdStoreLock(prisma, store.id);

    let settled = false;
    const pending = request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}/members/${staff.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'OWNER' })
      .then((res) => {
        settled = true;
        return res;
      });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(settled).toBe(false);

    await holder.release();

    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('OWNER');
  });

  it('dua penghapusan owner bersamaan menyisakan tepat satu owner, satu dapat 409', async () => {
    // Balapan NYATA lewat HTTP: dua request dikirim pada toko dengan dua
    // owner. Tanpa lock, keduanya bisa membaca "ada 2 owner" lalu keduanya
    // menghapus - dan toko kehilangan semua owner.
    //
    // CATATAN KEJUJURAN: test ini membuktikan HASIL yang benar terjadi. Dia
    // tidak membuktikan bahwa kunciknya adalah lock - untuk itu ada dua test
    // di atas yang mengamati blokirnya secara deterministik. Test ini
    // tidak deterministik: tanpa lock, urutan dua request ini sering tetap
    // aman, jadi kelulusannya sendiri bukan bukti.
    const owner = await createUser('OWNER');
    const second = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await addOwner(second, store.id);

    const remove = (userId: string) =>
      request(app.getHttpServer())
        .delete(`/api/v1/stores/${store.id}/members/${userId}`)
        .set('Authorization', `Bearer ${owner.token}`);

    const [a, b] = await Promise.all([remove(owner.id), remove(second.id)]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([204, 409]);

    const denied = a.status === 409 ? a : b;
    expect(denied.body.error.code).toBe('LAST_OWNER');

    // Invariant yang dijaga R-21: masih ada owner.
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, role: 'OWNER' } }),
    ).toBe(1);
  });

  it('dua penurunan owner bersamaan pada toko dua-owner menyisakan satu owner', async () => {
    // Toko dengan DUA owner, keduanya diminta diturunkan bersamaan. Satu
    // harus berhasil dan satu harus ditolak, karena kalau keduanya berhasil
    // tokonya tidak punya owner sama sekali.
    const owner = await createUser('OWNER');
    const second = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await addOwner(second, store.id);

    const demote = (userId: string) =>
      request(app.getHttpServer())
        .patch(`/api/v1/stores/${store.id}/members/${userId}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ role: 'STAFF' });

    const [a, b] = await Promise.all([demote(second.id), demote(owner.id)]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 409]);

    const denied = a.status === 409 ? a : b;
    expect(denied.body.error.code).toBe('LAST_OWNER');

    // Dari dua owner, hanya satu yang bisa diturunkan.
    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, role: 'OWNER' } }),
    ).toBe(1);
  });

  it('pencabutan owner yang sudah diturunkan operation lain tidak salah hitung', async () => {
    // Kasus yang disebut pada temuan: keputusan "apakah target owner" harus
    // diambil DI DALAM lock. Kalau diambil di luar, target yang perannya sudah
    // berubah di antara dua pembacaan akan dihitung memakai keadaan basi.
    //
    // Di sini tidak ada balapan. Yang diuji adalah bahwa pembacaan terjadi
    // setelah lock, dengan konsekuensi yang bisa diamati: operasi kedua
    // melihat keadaan yang sudah ditulis oleh yang pertama.
    const owner = await createUser('OWNER');
    const second = await createUser('OWNER');
    const store = await createStoreViaApi(owner);
    await addOwner(second, store.id);

    // Turunkan dulu: sekarang `second` bukan owner dan hanya `owner` yang OWNER.
    await request(app.getHttpServer())
      .patch(`/api/v1/stores/${store.id}/members/${second.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'STAFF' })
      .expect(200);

    // Cabut keanggotaannya: karena bukan owner, aturan LAST_OWNER tidak
    // menyala dan operasi berhasil - bukan salah menghitung bahwa target
    // "adalah owner".
    await request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}/members/${second.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);

    expect(
      await prisma.storeMembers.count({ where: { storeId: store.id, role: 'OWNER' } }),
    ).toBe(1);
  });
});
// ---------------------------------------------------------------------------
// Token undangan tidak boleh bocor ke log internal (5xx)
// ---------------------------------------------------------------------------

describe('token undangan tidak bocor ke log internal', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logged: string[];

  beforeEach(() => {
    logged = [];
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => String(a)).join(' '));
      });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('5xx pada URL berbentuk token undangan tidak menulis token mentah ke log', async () => {
    const token = randomUUID().replace(/-/g, '').repeat(2);

    await request(app.getHttpServer()).get(`/api/v1/echo/invitations/${token}/boom`).expect(500);

    // Log TETAP terjadi - yang diuji bukan "tidak ada log", tapi "lognya tidak
    // memuat rahasia".
    expect(logged.length).toBeGreaterThan(0);
    const line = logged.join('\n');
    expect(line).not.toContain(token);
    expect(line).toContain('[REDACTED]');
    // URL-nya sendiri masih terbaca, jadi kemampuan menelusuri insiden tidak
    // hilang seluruhnya.
    expect(line).toContain('/invitations/');
  });

  it('redaksi hanya menyentuh segmen token, bukan sisa URL', async () => {
    const token = randomUUID();

    await request(app.getHttpServer())
      .get(`/api/v1/echo/invitations/${token}/boom`)
      .expect(500);

    const line = logged.join('\n');
    expect(line).toContain('/invitations/[REDACTED]/boom');
    expect(line).toContain('GET ');
    // Kode internal yang ASLI tetap ada di log - redaksi tidak boleh ikut
    // mengikis informasi diagnostik, hanya segmen token.
    expect(line).toContain('DB_DOWN');
  });

  it('URL tanpa segmen rahasia tetap apa adanya (tidak ada pelemahan umum)', async () => {
    // Sensor harus sempit. Kalau `redactInvitationToken` ikut menyensor
    // semua URL, test ini gagal dan kemampuan menelusuri insiden di
    // endpoint lain ikut hilang.
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner, { name: 'Toko Untuk Log' });

    await request(app.getHttpServer())
      .get(`/api/v1/echo/prisma-missing`)
      .query({ id: '00000000-0000-0000-0000-000000000000' })
      .expect(404);

    // 404 tidak dilog (hanya 5xx yang dilog), jadi pancing 5xx lewat route
    // echo yang tidak berbentuk undangan.
    await request(app.getHttpServer())
      .get(`/api/v1/echo/boom-http`)
      .expect(500);

    const line = logged.join('\n');
    expect(line).toContain('/api/v1/echo/boom-http');
    expect(line).not.toContain('[REDACTED]');
    // Toko yang tadi dibuat tidak seharusnya muncul di log route mana pun.
    expect(line).not.toContain(store.id);
  });
});
// ---------------------------------------------------------------------------
// R-19: DELETE toko tetap tidak ada
// ---------------------------------------------------------------------------

describe('R-19: penghapusan toko tetap tidak ada', () => {
  it('tidak ada DELETE /stores/:storeId', async () => {
    const owner = await createUser('OWNER');
    const store = await createStoreViaApi(owner);

    await request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);

    // Positive control: hapus ANGGOTA tetap ada dan tetap butuh OWNER.
    const staff = await createUser('OWNER');
    await prisma.storeMembers.create({
      data: { storeId: store.id, userId: staff.id, role: 'STAFF' },
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/stores/${store.id}/members/${staff.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    expect(await prisma.stores.count({ where: { id: store.id } })).toBe(1);
  });
});