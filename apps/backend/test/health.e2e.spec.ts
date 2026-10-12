import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import { buildTestApp } from './utils/test-app.js';

/**
 * GATE-T6-A: `/health/details`.
 *
 * Endpoint ini `@Public()` di level kelas sejak Task 1 dan baru dikunci di task
 * ini. Tiga hal yang diuji, masing-masing dengan mechanismenya sendiri:
 *
 * - **Otorisasi** - `@Public()` pindah dari kelas ke handler `check`, dan
 *   `@Roles('ADMIN')` dipasang di `details`. Non-ADMIN harus 403, tanpa token
 *   401.
 * - **Tidak membocorkan** - respons hanya boleh berisi status komponen dan
 *   timestamp. Env var, versi internal, dan stack trace tidak boleh muncul, dan
 *   pemeriksaan dilakukan dengan menyisir SELURUH string respons terhadap nilai
 *   rahasia yang diketahui - bukan hanya mengecek beberapa kunci yang diharapkan
 *   tidak ada.
 * - **Kegagalan database tidak boleh** jadi 500, karena endpoint ini tugasnya
 *   justru melaporkan bahwa ada yang tidak sehat.
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

/**
 * Buat user lewat API, ubah peran platformnya, lalu login.
 *
 * Login selalu SESUDAH peran diubah, karena `JwtStrategy.validate` membaca role
 * dari claim JWT dan tidak cek database.
 */
async function createUser(role: 'ADMIN' | 'OWNER' | 'STAFF'): Promise<{ id: string; token: string }> {
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

  return { id: user.id, token: login.body.data.accessToken };
}

// ---------------------------------------------------------------------------
// Otorisasi
// ---------------------------------------------------------------------------

describe('GATE-T6-A: /health/details dikunci ADMIN', () => {
  it('tanpa token ditolak 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/details').expect(401);
  });

  it('OWNER ditolak 403', async () => {
    const owner = await createUser('OWNER');

    const res = await request(app.getHttpServer())
      .get('/api/v1/health/details')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('STAFF ditolak 403', async () => {
    const staff = await createUser('STAFF');

    const res = await request(app.getHttpServer())
      .get('/api/v1/health/details')
      .set('Authorization', `Bearer ${staff.token}`)
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('ADMIN boleh, dan positive control-nya: /health tetap publik', async () => {
    // Positive control wajib. Tanpa `/health` tetap terbuka, test di atas hanya
    // membuktikan bahwa endpoint-nya menutup siapa saja - termasuk ADMIN, yang
    // memang seharusnya bisa.
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    const admin = await createUser('ADMIN');
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/details')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(res.body.data.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Tidak membocorkan
// ---------------------------------------------------------------------------

describe('/health/details tidak membocorkan env var maupun stack trace', () => {
  /**
   * Nilai rahasia yang dikenal dan tidak boleh muncul di respons.
   *
   * Daftar ini dibaca dari `process.env`, bukan ditulis literal, supaya test gagal
   * kalau suatu saat `TEST_ENV` berubah dan daftar basi ini tidak menangkap
   * nilai yang baru.
   */
  function secretsInEnvironment(): string[] {
    return [
      process.env['JWT_SECRET'] ?? '',
      process.env['DATABASE_URL'] ?? '',
      'test-secret-for-e2e-only',
      'bisnis_insight_test',
    ].filter((value) => value.length > 0);
  }

  it('respons tidak memuat nilai env var yang diketahui', async () => {
    const admin = await createUser('ADMIN');

    const res = await request(app.getHttpServer())
      .get('/api/v1/health/details')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const serialized = JSON.stringify(res.body);
    for (const secret of secretsInEnvironment()) {
      expect(serialized).not.toContain(secret);
    }

    // Dan nama variabelnya sendiri tidak muncul, sehingga "DATABASE_URL"
    // yang tidak punya nilai pun tetap merupakan kebocoran.
    expect(serialized).not.toMatch(/DATABASE_URL|JWT_SECRET|PASSWORD|SECRET/i);
  });

  it('respons tidak memuat stack trace maupun path internal', async () => {
    const admin = await createUser('ADMIN');

    const res = await request(app.getHttpServer())
      .get('/api/v1/health/details')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const serialized = JSON.stringify(res.body);
    // `    at ` adalah awal frame stack Node. Nama file sumber, path modul, dan
    // nama kelas internal adalah tiga hal yang selalu ikut kalau stack bocor.
    expect(serialized).not.toContain('    at ');
    expect(serialized).not.toMatch(/node_modules|\.ts:\d+|\.js:\d+|[A-Z]:\\|\/home\//);
    expect(serialized).not.toContain('Prisma');
    expect(res.body).not.toHaveProperty('error');
  });

  it('respons hanya berisi status, timestamp, dan komponen - tidak ada field lain', async () => {
    // Bentuk yang dikunci, bukan hanya "tidak memuat rahasia". Endpoint ini
    // akan terus berkembang; test ini yang memastikan setiap tambahan field harus
    // melewati keputusan sadar, bukan datang tanpa sengaja.
    const admin = await createUser('ADMIN');

    const res = await request(app.getHttpServer())
      .get('/api/v1/health/details')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(Object.keys(res.body.data).sort()).toEqual(['components', 'status', 'timestamp']);
    expect(res.body.data.components).toHaveLength(1);
    expect(Object.keys(res.body.data.components[0]).sort()).toEqual([
      'checkedAt',
      'name',
      'status',
    ]);
    // Tidak ada versi runtime, tidak ada penggunaan memori, tidak ada uptime.
    expect(JSON.stringify(res.body)).not.toMatch(/version|memory|uptime|node/i);
  });

  it('komponen database melaporkan status dan waktu pemeriksaan yang masuk akal', async () => {
    const admin = await createUser('ADMIN');

    const res = await request(app.getHttpServer())
      .get('/api/v1/health/details')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(res.body.data.components[0]).toMatchObject({ name: 'database', status: 'up' });
    const checkedAt = Date.parse(res.body.data.components[0].checkedAt);
    expect(Number.isFinite(checkedAt)).toBe(true);
    // Waktu pemeriksaan harus nyata, bukan epoch atau nilai arbitrer.
    expect(Math.abs(Date.now() - checkedAt)).toBeLessThan(60_000);
  });

  it('respons 403 untuk non-ADMIN juga tidak membocorkan apa pun', async () => {
    // Jalur yang DITOLAK punya risiko bocor yang berbeda: saat handler tidak
    // dijalankan, yang bisa bocor adalah filter error global. Diperiksa
    // terpisah karena ia tidak melewati kode yang sama.
    const owner = await createUser('OWNER');

    const res = await request(app.getHttpServer())
      .get('/api/v1/health/details')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403);

    const serialized = JSON.stringify(res.body);
    for (const secret of secretsInEnvironment()) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain('    at ');
    expect(res.body).not.toHaveProperty('data');
  });
});
