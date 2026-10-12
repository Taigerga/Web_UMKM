import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuditService } from '../src/audit/audit.service.js';
import { buildTestApp } from './utils/test-app.js';

/**
 * GATE-T6-B: jejak audit.
 *
 * ## Apa yang sebenarnya diuji di sini
 *
 * Menjaga setiap call site satu per satu tidak membuktikan apa pun tentang
 * kebocoran. Yang membuktikannya: jalankan operasi NYATA yang menghasilkan
 * handle rahasia - password, refresh token, token undangan mentah - lalu BACA
 * TABEL `audit_logs` dan periksa isinya. Tidak ada tempat lain yang bisa
 * menjadi tujuan kebocoran, jadi di situ pula asersinya ditempatkan.
 *
 * Tiga hal lain yang mudah lolos di review dan karena itu punya test sendiri:
 *
 * 1. **Redaksi tetap aktif di jalur produksi.** `AuditService` membuang kunci
 *    `meta` yang tidak ada di allowlist dan BERTERIAK saat melakukannya. Test
 *    "seluruh sequence tidak memunculkan peringatan redaksi" menangkap
 *    `Logger.warn` sepanjang sequence, jadi call site yang nanti menambah
 *    `password` ke `meta` akan menggagalkan test - bukan lolos diam-diam karena
 *    kebetulan tidak ada yang memodbah allowlist.
 * 2. **Positive control untuk redaksi itu.** Kalau tidak ada call site yang
 *    PERNAH mencoba mengirim kunci terlarang, test di atas hanya membuktikan
 *    "tidak ada yang mencoba", bukan "redaksi bekerja".
 * 3. **R-23 dari luar.** Kalau penulisan audit melempar, operasi bisnis harus
 *    tetap berhasil.
 */
let app: INestApplication;
let prisma: PrismaService;

const VALID_PASSWORD = 'rahasia-kuat-123';
const REFRESH_COOKIE = 'bi_rt';

/** User-Agent eksplisit supaya kolom `user_agent` bisa diperiksa isinya. */
const TEST_USER_AGENT = 'BisnisInsight-Audit-Test/1.0';

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

/**
 * Batas waktu untuk test yang menjalankan seluruh sequence.
 *
 * Sequence itu nyata: tiga registrasi, tiga login, satu toko, satu undangan,
 * satu terima undangan, dua operasi keanggotaan, refresh, logout, ganti
 * password, satu panggilan admin, dan satu login gagal - semuanya lewat HTTP ke
 * database sungguhan, dengan hashing argon2 di setiap registrasi dan login.
 *
 * Batas bawaan 5 detik terlalu pendek untuk itu, dan menaikkan batas AKHIR-nya
 * hanya membuat kegagalan asli muncul lebih lambat.
 */
const SEQUENCE_TIMEOUT = 60_000;

interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  refreshToken: string;
}

/** Ambil nilai satu cookie dari respons supertest. */
function cookieValue(response: request.Response, name: string): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = list.find((c) => c.startsWith(`${name}=`));
  if (!match) throw new Error(`Cookie "${name}" tidak ada di respons.`);
  return decodeURIComponent(match.split(';')[0]!.slice(name.length + 1));
}

/**
 * Request baru dengan header `User-Agent` yang sudah dipasang.
 *
 * Dispasang di sini, di satu tempat, supaya kolom `user_agent` pada setiap baris
 * audit berasal dari sumber yang sama dan bisa dibandingkan. Kalau header ini
 * dipasang per call site, test "setiap baris mengisi ip dan userAgent" akan
 * lulus karena setengah baris punya `unknown` - bukan karena mekanismenya benar.
 */
function api(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
): request.Test {
  const base = request(app.getHttpServer());
  const header = 'User-Agent';
  const ua = TEST_USER_AGENT;

  switch (method) {
    case 'get':
      return base.get(path).set(header, ua);
    case 'post':
      return base.post(path).set(header, ua);
    case 'patch':
      return base.patch(path).set(header, ua);
    case 'delete':
      return base.delete(path).set(header, ua);
  }
}

/** Daftar, ubah peran platform, lalu login. Kembalikan access + refresh token. */
async function registerAndLogin(role: 'ADMIN' | 'OWNER' | 'STAFF' = 'OWNER'): Promise<TestUser> {
  const email = uniqueEmail(role.toLowerCase());
  const password = `${VALID_PASSWORD}-${randomUUID().slice(0, 4)}`;

  await api('post', '/api/v1/auth/register')
    .send({ email, password, name: `Uji ${role}` })
    .expect(201);

  const user = await prisma.users.update({ where: { email }, data: { role } });

  const login = await api('post', '/api/v1/auth/login')
    .send({ email, password })
    .expect(201);

  return {
    id: user.id,
    email,
    password,
    token: login.body.data.accessToken,
    refreshToken: cookieValue(login, REFRESH_COOKIE),
  };
}

async function createStoreViaApi(user: TestUser): Promise<string> {
  const res = await api('post', '/api/v1/stores')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ name: `Toko ${randomUUID().slice(0, 8)}`, city: 'Bandung' })
    .expect(201);
  return res.body.data.id as string;
}

interface Sequence {
  owner: TestUser;
  invitee: TestUser;
  admin: TestUser;
  storeId: string;
  /** Semua nilai yang JANGAN BOLEH muncul di `audit_logs`. */
  forbiddenValues: string[];
  /** Hash password asli, dibaca langsung dari tabel `users`. */
  passwordHashes: string[];
  /** Hash token yang tersimpan di `refresh_tokens` dan `store_invites`. */
  tokenHashes: string[];
}

/**
 * Jalankan SEQUENCE OPERASI NYATA dan kembalikan handle rahasia yang dipegang.
 *
 * Handle dikembalikan justru agar test bisa menyisir nilainya nanti. Tanpa ini,
 * test hanya bisa berbentuk "tidak ada yang aneh" tanpa pernah menuliskan nilai
 * yang seharusnya tidak muncul.
 */
async function runRealisticSequence(): Promise<Sequence> {
  const owner = await registerAndLogin('OWNER');
  const invitee = await registerAndLogin('OWNER');
  const admin = await registerAndLogin('ADMIN');
  const storeId = await createStoreViaApi(owner);

  await api('patch', `/api/v1/stores/${storeId}`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ name: 'Warung Bu Tuti', city: 'Bandung' })
    .expect(200);

  const invite = await api('post', `/api/v1/stores/${storeId}/invitations`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ email: invitee.email, role: 'STAFF' })
    .expect(201);
  const rawInviteToken = invite.body.data.token as string;

  await api('get', `/api/v1/invitations/${rawInviteToken}`).expect(200);

  await api('post', `/api/v1/invitations/${rawInviteToken}/accept`)
    .set('Authorization', `Bearer ${invitee.token}`)
    .expect(201);

  await api('patch', `/api/v1/stores/${storeId}/members/${invitee.id}`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ role: 'OWNER' })
    .expect(200);

  await api('delete', `/api/v1/stores/${storeId}/members/${invitee.id}`)
    .set('Authorization', `Bearer ${owner.token}`)
    .expect(204);

  // Refresh dulu, lalu ganti password. Urutannya penting: `changePassword`
  // mencabut SEMUA refresh token miliknya, jadi kalau dilakukan lebih dulu, token
  // yang dirotasi di bawah sudah tidak berlaku lagi.
  const refreshed = await api('post', '/api/v1/auth/refresh')
    .set('Cookie', `${REFRESH_COOKIE}=${owner.refreshToken}`)
    .expect(201);
  const rotatedRefreshToken = cookieValue(refreshed, REFRESH_COOKIE);

  await api('post', '/api/v1/auth/logout')
    .set('Cookie', `${REFRESH_COOKIE}=${rotatedRefreshToken}`)
    .expect(204);

  await api('post', '/api/v1/users/me/password')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ currentPassword: owner.password, newPassword: 'password-baru-456' })
    .expect(204);

  await api('patch', `/api/v1/admin/users/${invitee.id}/status`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ isActive: false })
    .expect(200);

  await api('post', '/api/v1/auth/login')
    .send({ email: owner.email, password: 'password-salah-sama-sekali' })
    .expect(401);

  // Dibaca dari database, bukan dihitung ulang: yang diuji adalah nilai yang
  // benar-benar ada di `users.passwordHash`.
  const users = await prisma.users.findMany({ select: { passwordHash: true } });
  const refreshRows = await prisma.refreshTokens.findMany({ select: { tokenHash: true } });
  const inviteRows = await prisma.storeInvites.findMany({ select: { tokenHash: true } });

  return {
    owner,
    invitee,
    admin,
    storeId,
    passwordHashes: users.map((u) => u.passwordHash),
    tokenHashes: [...refreshRows, ...inviteRows].map((r) => r.tokenHash),
    forbiddenValues: [
      owner.password,
      'password-baru-456',
      'password-salah-sama-sekali',
      owner.refreshToken,
      rotatedRefreshToken,
      rawInviteToken,
    ],
  };
}

// ---------------------------------------------------------------------------
// GATE-T6-B: tabel audit terisi
// ---------------------------------------------------------------------------

describe('GATE-T6-B: jejak audit untuk aktivitas yang sudah ada', () => {
  it('sequence operasi nyata menulis baris audit untuk setiap peristiwa', async () => {
    const { owner, invitee, admin, storeId } = await runRealisticSequence();

    const rows = await prisma.auditLogs.findMany({ orderBy: { createdAt: 'asc' } });
    const actions = rows.map((r) => r.action);

    // Backfill R-24. Daftar ini persis daftar di ruling; satu yang hilang saja
    // sudah cukup untuk menggagalkan test.
    for (const action of [
      'auth.register',
      'auth.login',
      'auth.logout',
      'auth.refresh',
      'auth.password_changed',
      'store.created',
      'store.updated',
      'store.invitation_created',
      'store.member_role_changed',
      'store.member_removed',
      'invitation.previewed',
      'invitation.accepted',
      'admin.user_status_changed',
    ]) {
      expect(actions).toContain(action);
    }

    // Pelaku dan target-nya benar, bukan sekadar "ada baris".
    expect(rows.find((r) => r.action === 'store.created')).toMatchObject({
      actorId: owner.id,
      storeId,
      entity: 'store',
      entityId: storeId,
    });

    expect(rows.find((r) => r.action === 'store.member_removed')).toMatchObject({
      actorId: owner.id,
      storeId,
      entity: 'store_member',
      entityId: invitee.id,
    });

    expect(rows.find((r) => r.action === 'admin.user_status_changed')).toMatchObject({
      actorId: admin.id,
      entity: 'user',
      entityId: invitee.id,
      meta: { from: true, to: false },
    });

    expect(rows.find((r) => r.action === 'store.member_role_changed')).toMatchObject({
      meta: { from: 'STAFF', to: 'OWNER' },
    });

    // `invitation.previewed` tidak punya pelaku: halamannya publik.
    expect(rows.find((r) => r.action === 'invitation.previewed')).toMatchObject({
      actorId: null,
      storeId,
    });
  }, SEQUENCE_TIMEOUT);

  it('setiap baris mengisi ip dan userAgent dari request yang memicunya', async () => {
    await runRealisticSequence();

    const rows = await prisma.auditLogs.findMany();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // Yang diperiksa adalah NILAINYA, bukan hanya kehadirannya: tanpa
      // middleware konteks semua kolom berisi 'unknown' dan test ini tetap hijau.
      expect(row.ip).toMatch(/^(127\.0\.0\.1|::1)$/);
      expect(row.userAgent).toBe(TEST_USER_AGENT);
    }
  }, SEQUENCE_TIMEOUT);

  it('store.updated mencatat nama kolom yang berubah, bukan nilainya', async () => {
    await runRealisticSequence();

    const rows = await prisma.auditLogs.findMany({ where: { action: 'store.updated' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.meta).toEqual({ fields: ['name', 'city'] });

    // Nama toko yang baru tidak ikut. Nilainya sudah ada di `stores`; salinannya
    // di sini cuma sumber kedua yang bisa basi.
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('Warung Bu Tuti');
    expect(dump).not.toContain('Bandung');
  }, SEQUENCE_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Redaksi: membaca isi tabel, bukan call site
// ---------------------------------------------------------------------------

describe('audit log tidak pernah memuat rahasia', () => {
  it('tidak ada password, hash password, atau token di SELURUH baris audit', async () => {
    // Test yang diminta brief: jalankan operasi, baca tabel, sisir isinya. Yang
    // disisir adalah nilai ASLI - password yang diketik, hash argon2 dari
    // database, refresh token dari cookie, dan token undangan dari respons.
    const { passwordHashes, tokenHashes, forbiddenValues } = await runRealisticSequence();

    const rows = await prisma.auditLogs.findMany();
    expect(rows.length).toBeGreaterThan(10);

    const dump = JSON.stringify(rows);

    for (const value of passwordHashes) {
      expect(value.length).toBeGreaterThan(10);
      expect(dump).not.toContain(value);
    }

    for (const value of tokenHashes) {
      expect(value).toHaveLength(64);
      expect(dump).not.toContain(value);
    }

    for (const value of forbiddenValues) {
      expect(value.length).toBeGreaterThan(0);
      expect(dump).not.toContain(value);
    }

    // Nama field rahasia tidak boleh muncul di `meta`. Pindai HANYA kolom meta:
    // nama tindakan `auth.password_changed` memang memuat kata "password" dan
    // itu memang yang seharusnya terjadi - yang terlarang adalah nilai dan nama
    // field di dalam `meta`.
    const metaDump = JSON.stringify(rows.map((row) => row.meta));
    expect(metaDump).not.toMatch(/password|passwd|tokenHash|refreshToken|jwt|secret/i);
    expect(metaDump).not.toContain('$argon2');

    // Kolom `entity` dan `action` juga dikunci: `entity` hanya boleh salah satu
    // jenis entitas yang dikenal, dan `action` harus berbentuk
    // `<area>.<peristiwa>`. Keduanya menutup jalur kebocoran lewat nama kolom,
    // bukan lewat nilainya.
    const allowedEntities = ['user', 'store', 'store_member', 'invitation'];
    expect(rows.every((row) => allowedEntities.includes(row.entity ?? ''))).toBe(true);
    expect(rows.every((row) => /^(auth|store|invitation|admin)\.[a-z_]+$/.test(row.action ?? '')))
      .toBe(true);
  }, SEQUENCE_TIMEOUT);

  it('tidak ada baris audit yang memuat email sebagai nilai meta', async () => {
    // Email bukan rahasia, tapi memuatnya berarti menggandakan data pribadi di
    // tabel yang dibaca admin dan bisa diekspor. Tidak ada action pun yang
    // mengizinkan `email`; test ini menjaga keputusan itu tidak dilonggarkan.
    await runRealisticSequence();

    const rows = await prisma.auditLogs.findMany();
    const emails = (await prisma.users.findMany({ select: { email: true } })).map(
      (u) => u.email,
    );

    const dump = JSON.stringify(rows);
    for (const email of emails) {
      expect(dump).not.toContain(email);
    }
  }, SEQUENCE_TIMEOUT);

  it('seluruh sequence tidak memunculkan satu pun peringatan redaksi meta', async () => {
    // INI test yang membuat redaksi tidak-vakum. Kalau `AuditService` hanya
    // diam-diam membuang kunci terlarang, test ini tidak akan bisa membedakan
    // "tidak ada yang mencoba memasukkan rahasia" dari "redaksi tidak
    // bekerja". Karena pembuangan berteriak lewat `Logger.warn`, setiap call
    // site yang mencoba mengirim kunci tak terizinkan terlihat di sini.
    const warnings: string[] = [];
    const spy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((...args: unknown[]) => {
        warnings.push(args.map((a) => String(a)).join(' '));
      });

    try {
      await runRealisticSequence();
    } finally {
      spy.mockRestore();
    }

    expect(warnings.filter((w) => w.includes('redaksi meta'))).toEqual([]);
  }, SEQUENCE_TIMEOUT);

  it('pembuangan kunci terlarang benar-benar terjadi di jalur produksi', async () => {
    // Positive control untuk test di atas: kalau tidak ada call site yang pernah
    // mencoba mengirim kunci tak terizinkan, "tidak ada peringatan" hanya
    // membuktikan tidak ada yang mencoba - bukan bahwa redaksi bekerja.
    //
    // Yang dicoba adalah `AuditService` sungguhan dengan meta berisi
    // `password`, `refreshToken`, dan `token`: nama yang paling mungkin diketik
    // pemanggil.
    const warnings: string[] = [];
    const spy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((...args: unknown[]) => {
        warnings.push(args.map((a) => String(a)).join(' '));
      });

    try {
      await app.get(AuditService).record({
        action: 'auth.login',
        entity: 'user',
        meta: {
          password: 'rahasia-123',
          refreshToken: 'token-roti-abc',
          token: 'token-undangan-xyz',
        },
      });
    } finally {
      spy.mockRestore();
    }

    const row = await prisma.auditLogs.findFirstOrThrow({
      where: { action: 'auth.login' },
      orderBy: { createdAt: 'desc' },
    });

    const dump = JSON.stringify(row);
    expect(dump).not.toContain('rahasia-123');
    expect(dump).not.toContain('token-roti-abc');
    expect(dump).not.toContain('token-undangan-xyz');
    expect(row.meta).toBeNull();

    // Ketiganya ditolak, dan ketiganya disebutkan nama kuncinya.
    const redaction = warnings.filter((w) => w.includes('redaksi meta'));
    expect(redaction).toHaveLength(1);
    for (const key of ['password', 'refreshToken', 'token']) {
      expect(warnings.join('\n')).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// R-23: kegagalan audit tidak menggagalkan operasi bisnis
// ---------------------------------------------------------------------------

describe('kegagalan audit tidak menggagalkan operasi bisnis (R-23)', () => {
  let warnings: string[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnings = [];
    spy = vi.spyOn(Logger.prototype, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map((a) => String(a)).join(' '));
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('POST /stores tetap 201 dan tokonya benar-benar ada saat audit gagal menulis', async () => {
    const user = await registerAndLogin('OWNER');

    // Dimatikan HANYA penulisan audit. `StoresService` memakai instance
    // `prisma` yang sama, jadi spy ini tidak menyentuh apa pun yang lain.
    const createSpy = vi
      .spyOn(prisma.auditLogs, 'create')
      .mockRejectedValue(new Error('audit down: kolom tidak dikenal'));

    let createdId: string;
    try {
      const res = await api('post', '/api/v1/stores')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: 'Toko Tetap Jadi', city: 'Semarang' })
        .expect(201);
      createdId = res.body.data.id as string;
    } finally {
      createSpy.mockRestore();
    }

    // Operasi bisnis SELESAI: tokonya ada, dan keanggotaannya juga.
    const store = await prisma.stores.findUniqueOrThrow({ where: { id: createdId } });
    expect(store.name).toBe('Toko Tetap Jadi');
    expect(
      await prisma.storeMembers.count({ where: { storeId: createdId, userId: user.id } }),
    ).toBe(1);

    // Audit-nya hilang - konsekuensi yang memang diterima - tapi hilang dengan
    // suara, bukan diam-diam.
    expect(await prisma.auditLogs.count({ where: { action: 'store.created' } })).toBe(0);
    expect(warnings.filter((w) => w.includes('audit gagal dicatat')).length).toBeGreaterThan(0);
  });

  it('pesan error dari driver yang memuat rahasia tidak ikut ke log teknis', async () => {
    const user = await registerAndLogin('OWNER');

    // Prisma memang memasukkan nilai yang gagal disimpan ke pesan error. Kalau
    // pesan itu ikut dicatat, redaksi meta jadi tidak berarti.
    const createSpy = vi.spyOn(prisma.auditLogs, 'create').mockRejectedValue(
      new Error('Invalid create invocation: passwordHash=rahasia-123 token=undangan-abc'),
    );

    try {
      await api('post', '/api/v1/stores')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: 'Toko Bocor' })
        .expect(201);
    } finally {
      createSpy.mockRestore();
    }

    const line = warnings.join('\n');
    expect(line).toContain('audit gagal dicatat');
    expect(line).not.toContain('rahasia-123');
    expect(line).not.toContain('undangan-abc');
  });

  it('gagal menulis audit TIDAK membuat baris audit dengan isi terpotong', async () => {
    // `record` menulis dalam satu operasi: tidak ada keadaan setengah jadi yang
    // bisa tersisa di tabel saat penulisan gagal.
    const user = await registerAndLogin('OWNER');
    await prisma.auditLogs.deleteMany({});

    const createSpy = vi
      .spyOn(prisma.auditLogs, 'create')
      .mockRejectedValue(new Error('koneksi terputus'));

    try {
      await api('post', '/api/v1/stores')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: 'Toko Ketiga' })
        .expect(201);
    } finally {
      createSpy.mockRestore();
    }

    expect(await prisma.stores.count({ where: { name: 'Toko Ketiga' } })).toBe(1);
    expect(await prisma.auditLogs.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// R-25: log teknis dan audit log terpisah
// ---------------------------------------------------------------------------

describe('R-25: audit log tidak dipakai sebagai tempat diagnostik', () => {
  it('error 5xx tidak menulis apa pun ke audit_logs', async () => {
    // Yang dicatat di `audit_logs` adalah aktivitas pengguna. 5xx adalah
    // kondisi sistem, dan menambahkannya ke sana membuat tabel yang dibaca
    // owner toko ikut memuat diagnosis platform yang bukan miliknya.
    await api('get', '/api/v1/echo/boom-http').expect(500);

    expect(await prisma.auditLogs.count()).toBe(0);
  });

  it('percobaan login gagal tercatat sebagai aktivitas, bukan sebagai dump error', async () => {
    const user = await registerAndLogin('OWNER');
    await prisma.auditLogs.deleteMany({});

    await api('post', '/api/v1/auth/login')
      .send({ email: user.email, password: 'salah' })
      .expect(401);

    const rows = await prisma.auditLogs.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'auth.login',
      actorId: user.id,
      meta: { outcome: 'failure', reason: 'INVALID_CREDENTIALS' },
    });

    // Yang masuk hanya kode aplikasi: bukan teks error, bukan stack, dan bukan
    // email yang dicoba.
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('    at ');
    expect(dump).not.toContain(user.email);
  });
});
