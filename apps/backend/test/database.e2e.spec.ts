import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppError } from '../src/common/errors/app-error.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { withTenantScope } from '../src/database/tenant-scope.extension.js';
import { buildTestApp } from './utils/test-app.js';

/**
 * Test integrasi Prisma 7 + adapter-mariadb terhadap `bisnis_insight_test`.
 *
 * Semua test di file ini memakai database yang sama, jadi datanya dibersihkan
 * sebelum tiap test agar tidak saling bergantung.
 */
let app: INestApplication;
let prisma: PrismaService;

async function resetDatabase(client: PrismaService): Promise<void> {
  // Urutan penghapusan mengikuti dependensi FK.
  await client.auditLogs.deleteMany({});
  await client.refreshTokens.deleteMany({});
  await client.storeInvites.deleteMany({});
  await client.storeMembers.deleteMany({});
  await client.stores.deleteMany({});
  await client.users.deleteMany({});
}

/** Dua user, dua store, satu membership yang hanya ada di store A. */
async function seedTwoStores(client: PrismaService): Promise<{
  storeAId: string;
  storeBId: string;
}> {
  const userA = await client.users.create({
    data: { email: `a-${randomUUID()}@test.local`, name: 'User A', passwordHash: 'x' },
  });
  const userB = await client.users.create({
    data: { email: `b-${randomUUID()}@test.local`, name: 'User B', passwordHash: 'x' },
  });

  const storeA = await client.stores.create({
    data: { name: 'Toko A', createdById: userA.id },
  });
  const storeB = await client.stores.create({
    data: { name: 'Toko B', createdById: userB.id },
  });

  await client.storeMembers.create({
    data: { storeId: storeA.id, userId: userA.id, role: 'OWNER' },
  });

  return { storeAId: storeA.id, storeBId: storeB.id };
}

beforeAll(async () => {
  app = await buildTestApp();
  // Diambil dari instance yang SEDANG BERJALAN, bukan client kedua: hanya
  // ada satu pool koneksi ke database test.
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await app.close();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

describe('PrismaService', () => {
  it('bisa query ke database', async () => {
    const n = await prisma.users.count();
    expect(typeof n).toBe('number');
  });

  it('connect dan disconnect sesuai lifecycle module', async () => {
    // `app.close()` di afterAll memanggil onModuleDestroy -> $disconnect.
    // Kalau wiring-nya salah, test suite ini gagal saat teardown.
    expect(await prisma.$queryRawUnsafe('SELECT 1')).toBeDefined();
  });
});

describe('withTenantScope', () => {
  it('menyuntikkan filter storeId', async () => {
    const { storeAId } = await seedTwoStores(prisma);

    const scoped = withTenantScope(prisma.storeMembers, storeAId);
    const rows = await scoped.findMany({});

    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.storeId === storeAId)).toBe(true);
  });

  it('mengembalikan nol baris untuk toko tanpa membership', async () => {
    const { storeBId } = await seedTwoStores(prisma);

    const scoped = withTenantScope(prisma.storeMembers, storeBId);

    expect(await scoped.findMany({})).toEqual([]);
    expect(await scoped.count({})).toBe(0);
  });

  it('menolak storeId kosong', () => {
    expect(() => withTenantScope(prisma.storeMembers, '')).toThrow(AppError);
  });

  it('menghapus hanya baris milik toko yang di-scope', async () => {
    const { storeAId } = await seedTwoStores(prisma);

    await withTenantScope(prisma.storeMembers, storeAId).deleteMany({});

    expect(await prisma.storeMembers.count({})).toBe(0);
  });
});

/**
 * `PrismaService.tenantModel` adalah pintu produksi ke `withTenantScope`.
 * Dipakai service di task-task berikutnya; di sini yang diuji adalah
 * kontraknya terhadap database sungguhan.
 */
describe('PrismaService.tenantModel', () => {
  it('mengembalikan delegate yang ter-scope ke tenant yang diminta', async () => {
    const { storeAId, storeBId } = await seedTwoStores(prisma);

    const membersA = await prisma.tenantModel('storeMembers', storeAId).findMany({});
    const membersB = await prisma.tenantModel('storeMembers', storeBId).findMany({});

    expect(membersA).toHaveLength(1);
    expect(membersA.every((m) => m.storeId === storeAId)).toBe(true);
    expect(membersB).toHaveLength(0);
  });

  it('menolak storeId kosong tanpa menjalankan query', () => {
    expect(() => prisma.tenantModel('storeMembers', '')).toThrow(AppError);
  });

  it('hanya menerima model yang terdaftar di TENANT_MODELS', () => {
    // Sengaja di luar tipe: memastikan ada pagar runtime, bukan hanya tipe.
    const model = 'users' as unknown as 'storeMembers';
    expect(() => prisma.tenantModel(model, 'store-apa-saja')).toThrow(AppError);
  });
});

describe('kolom Json', () => {
  it('audit_logs menerima Json pada kolom meta', async () => {
    await expect(
      prisma.auditLogs.create({
        data: {
          action: 'X',
          entity: 'Y',
          ip: '127.0.0.1',
          userAgent: 'vitest',
          meta: { a: 1 },
        },
      }),
    ).resolves.toHaveProperty('id');
  });
});

/**
 * GATE-T2-A: pemetaan error Prisma di `AllExceptionsFilter` belum pernah
 * dieksekusi terhadap error Prisma sungguhan. Test di sini benar-benar memicu
 * unique-violation, not-found, dan FK violation lewat HTTP, lalu memeriksa
 * kode/status yang sampai ke client. Ini sekaligus membuktikan deteksi
 * struktural (`name === 'PrismaClientKnownRequestError'`) benar terhadap
 * Prisma 7.10.0 + @prisma/adapter-mariadb.
 */
describe('GATE-T2-A: pemetaan error Prisma ke envelope', () => {
  it('P2002 unique violation -> 409 DUPLICATE', async () => {
    const email = `dupe-${randomUUID()}@test.local`;

    const first = await request(app.getHttpServer())
      .post('/api/v1/echo/prisma-duplicate')
      .send({ email })
      .expect(201);
    expect(first.body).toHaveProperty('id');

    const second = await request(app.getHttpServer())
      .post('/api/v1/echo/prisma-duplicate')
      .send({ email })
      .expect(409);

    expect(second.body.error.code).toBe('DUPLICATE');
  });

  it('P2025 record tidak ada -> 404 NOT_FOUND', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/echo/prisma-missing')
      .send({ id: randomUUID() })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('P2003 foreign key violation -> 409 FK_VIOLATION', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/echo/prisma-fk')
      .send({ storeId: randomUUID(), userId: randomUUID() })
      .expect(409);

    expect(response.body.error.code).toBe('FK_VIOLATION');
  });

  it('tidak membocorkan nomor error Prisma ke client', async () => {
    const email = `leak-${randomUUID()}@test.local`;
    await request(app.getHttpServer()).post('/api/v1/echo/prisma-duplicate').send({ email }).expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/echo/prisma-duplicate')
      .send({ email })
      .expect(409);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('P2002');
    expect(serialized).not.toContain('prisma');
  });
});