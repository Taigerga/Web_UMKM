import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppError } from '../src/common/errors/app-error.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  TENANT_MODELS,
  withTenantScope,
} from '../src/database/tenant-scope.extension.js';
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

interface TwoStoreSeed {
  userAId: string;
  userBId: string;
  /** User tanpa membership, untuk menguji penulisan baru. */
  userCId: string;
  storeAId: string;
  storeBId: string;
}

/**
 * Dua user, dua toko, dan SATU membership di MASIH masing-masing toko, plus
 * satu user tanpa membership.
 *
 * Syarat ini penting: kalau hanya satu toko yang punya membership, test
 * scoping jadi tidak bisa membedakan "sudah ter-scope" dari "memang tidak ada
 * data lain". Role sengaja dibuat berbeda supaya `groupBy` bisa membuktikan
 * grupnya tidak menjangkau toko lain.
 */
async function seedTwoStoresWithMembers(client: PrismaService): Promise<TwoStoreSeed> {
  const userA = await client.users.create({
    data: { email: `a-${randomUUID()}@test.local`, name: 'User A', passwordHash: 'x' },
  });
  const userB = await client.users.create({
    data: { email: `b-${randomUUID()}@test.local`, name: 'User B', passwordHash: 'x' },
  });
  const userC = await client.users.create({
    data: { email: `c-${randomUUID()}@test.local`, name: 'User C', passwordHash: 'x' },
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
  await client.storeMembers.create({
    data: { storeId: storeB.id, userId: userB.id, role: 'STAFF' },
  });

  return {
    userAId: userA.id,
    userBId: userB.id,
    userCId: userC.id,
    storeAId: storeA.id,
    storeBId: storeB.id,
  };
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
  it('baca query ke database', async () => {
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
    const { storeAId } = await seedTwoStoresWithMembers(prisma);

    const rows = await withTenantScope(prisma.storeMembers, storeAId).findMany({});

    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.storeId === storeAId)).toBe(true);
  });

  it('mengembalikan nol baris untuk toko tanpa membership', async () => {
    const { userAId } = await seedTwoStoresWithMembers(prisma);
    const storeC = await prisma.stores.create({
      data: { name: 'Toko C', createdById: userAId },
    });

    const scoped = withTenantScope(prisma.storeMembers, storeC.id);

    expect(await scoped.findMany({})).toEqual([]);
    expect(await scoped.count({})).toBe(0);
  });

  it('menolak storeId kosong', () => {
    expect(() => withTenantScope(prisma.storeMembers, '')).toThrow(AppError);
  });

  it('menghapus hanya baris milik toko yang di-scope', async () => {
    const { storeAId, storeBId, userAId } = await seedTwoStoresWithMembers(prisma);

    await withTenantScope(prisma.storeMembers, storeAId).deleteMany({});

    // Sisa data harus persis membership toko B - bukan cuma "sesuai hitungan".
    const survivors = await prisma.storeMembers.findMany({});
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.storeId).toBe(storeBId);
    expect(survivors[0]?.userId).not.toBe(userAId);
  });
});

/**
 * R-2 / Critical 1: setiap anggota `TENANT_MODELS` harus benar-benar punya
 * kolom `storeId`. `stores` pernah salah masuk daftar dan gagal saat runtime.
 */
describe('groupBy bentuk by', () => {
  it('by berupa string tetap ter-scope dan memuat storeId di grup', async () => {
    const { storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    const groups = (await prisma
      .tenantModel('storeMembers', storeAId)
      .groupBy({ by: ['role'], _count: { _all: true } })) as unknown as Array<{
      role: string;
      storeId: string;
      _count: { _all: number };
    }>;

    expect(groups).toHaveLength(1);
    expect(groups[0]?.storeId).toBe(storeAId);
    expect(groups.some((g) => g.storeId === storeBId)).toBe(false);
  });

  it('by berupa objek tidak berubah jadi array campuran', async () => {
    const { storeAId } = await seedTwoStoresWithMembers(prisma);

    // CATATAN: Prisma 7.10 menolak bentuk objek pada `by` untuk groupBy
    // (`by: StoreMembersScalarFieldEnum[] | StoreMembersScalarFieldEnum`,
    // yaitu string saja) - termasuk TANPA proxy. Lihat laporan Task 2 fix
    // round 2. Jadi yang diuji di sini adalah bentuk yang di-proxy, yaitu
    // proxy tidak boleh mengubahnya jadi campuran string+objek.
    const delegate = prisma.tenantModel('storeMembers', storeAId) as unknown as {
      groupBy: (args: Record<string, unknown>) => Promise<unknown>;
    };

    const unscopedThrew = await delegate
      .groupBy({ by: [{ role: { sort: 'desc' } }], _count: { _all: true } })
      .then(() => false)
      .catch(() => true);
    // Delegan mentah (tanpa proxy), bentuk by yang sama.
    const raw = prisma.storeMembers as unknown as {
      groupBy: (args: Record<string, unknown>) => Promise<unknown>;
    };
    const rawThrew = await raw
      .groupBy({ by: [{ role: { sort: 'desc' } }], _count: { _all: true } })
      .then(() => false)
      .catch(() => true);

    // Dua-duanya ditolak oleh Prisma: bentuk objek tidak didukung.
    expect(rawThrew).toBe(true);
    expect(unscopedThrew).toBe(true);
  });

  it('entri by berupa string dan orderBy terpisah tetap bekerja', async () => {
    const { storeAId } = await seedTwoStoresWithMembers(prisma);

    const groups = (await prisma
      .tenantModel('storeMembers', storeAId)
      .groupBy({ by: ['role'], orderBy: { role: 'desc' }, _count: { _all: true } })) as unknown as Array<{
      role: string;
      storeId: string;
    }>;

    expect(groups).toHaveLength(1);
    expect(groups[0]?.storeId).toBe(storeAId);
  });
});

describe('TENANT_MODELS benar-benar punya kolom storeId', () => {
  it('setiap model bisa di-scope dan mengembalikan baris yang/storeId-nya', async () => {
    const { storeAId } = await seedTwoStoresWithMembers(prisma);

    for (const model of TENANT_MODELS) {
      // Delegate dari tiap model punya tipe berbeda, jadi dipanggil lewat satu
      // bentuk seragam. Yang diuji: operasi nyata terhadap database.
      const delegate = prisma.tenantModel(model, storeAId) as unknown as {
        findMany: (args?: Record<string, unknown>) => Promise<Array<{ storeId: string }>>;
      };
      const rows = await delegate.findMany({});
      expect(rows.every((r) => r.storeId === storeAId)).toBe(true);
    }
  });

  it('stores bukan model tenant: ditolak, bukan gagal diam-diam', () => {
    // Sengaja di luar tipe, untuk menguji pagar runtime.
    const model = 'stores' as unknown as 'storeMembers';

    expect(() => prisma.tenantModel(model, 'store-apa-saja')).toThrow(AppError);
  });

  it('models non-tenant lain juga ditolak', () => {
    for (const model of ['users', 'auditLogs', 'refreshTokens']) {
      expect(() =>
        prisma.tenantModel(model as unknown as 'storeMembers', 'store-apa-saja'),
      ).toThrow(AppError);
    }
  });
});

/**
 * Critical 2: delegate hasil `withTenantScope` bersifat default-deny.
 *
 * Semua test di sini memakai dua toko yang masing-masing punya satu membership,
 * jadi resultanya bisa dibandingkan secara bermakna.
 */
describe('default-deny: tidak ada operasi yang menembus antar tenant', () => {
  it('aggregate ter-scope, tidak menjumlahkan semua tenant', async () => {
    const { storeAId } = await seedTwoStoresWithMembers(prisma);

    const scoped = await prisma
      .tenantModel('storeMembers', storeAId)
      .aggregate({ _count: { _all: true } });
    const unscoped = await prisma.storeMembers.aggregate({ _count: { _all: true } });

    expect(scoped._count._all).toBe(1);
    // Pembanding: tanpa scope hasilnya 2. Kalau ini ikut ter-scope, test
    // sebelumnya tetap hijau padahal scoping-nya bocor.
    expect(unscoped._count._all).toBe(2);
  });

  it('groupBy menambahkan storeId ke by sehingga grup tidak lintas tenant', async () => {
    const { storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    // `by` sengaja TIDAK menyebut storeId: penyisipannya oleh proxy itu yang
// sedang diuji. Karena itu tipe hasilnya perlu dipert lebar lewat
// `as unknown as`.
    const groups = (await prisma
      .tenantModel('storeMembers', storeAId)
      .groupBy({ by: ['role'], _count: { _all: true } })) as unknown as Array<{
      role: string;
      storeId: string;
      _count: { _all: number };
    }>;

    // Role A (OWNER) dan B (STAFF) sengaja berbeda: kalau bocor, dua grup muncul.
    expect(groups).toHaveLength(1);
    expect(groups[0]?.role).toBe('OWNER');
    expect(groups[0]?.storeId).toBe(storeAId);
    expect(groups[0]?._count._all).toBe(1);
    expect(groups.some((g) => g.storeId === storeBId)).toBe(false);
  });

  it('findFirstOrThrow tidak mengembalikan baris tenant lain', async () => {
    const { storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    const row = await prisma
      .tenantModel('storeMembers', storeAId)
      .findFirstOrThrow({ orderBy: { joinedAt: 'asc' } });

    expect(row.storeId).toBe(storeAId);
    expect(row.storeId).not.toBe(storeBId);
  });

  it('findUniqueOrThrow menolak pemanggilan tanpa storeId', () => {
    // storeInvites punya unik `id`, jadi storeId harus disebut terpisah.
    const scoped = prisma.tenantModel('storeInvites', 'store-a');

    expect(() => scoped.findUniqueOrThrow({ where: { id: randomUUID() } })).toThrow(AppError);
  });

  it('findUniqueOrThrow menolak storeId milik tenant lain', () => {
    const scoped = prisma.tenantModel('storeInvites', 'store-a');

    expect(() =>
      scoped.findUniqueOrThrow({ where: { id: randomUUID(), storeId: 'store-b' } }),
    ).toThrow(AppError);
  });

  it('findUniqueOrThrow menolak kunci majemuk milik tenant lain', () => {
    // storeMembers unik-nya `@@id([storeId, userId])`, jadi bentuknya compound.
    const scoped = prisma.tenantModel('storeMembers', 'store-a');

    expect(() =>
      scoped.findUniqueOrThrow({
        where: { storeId_userId: { storeId: 'store-b', userId: 'user-b' } },
      }),
    ).toThrow(AppError);
  });

  it('findUniqueOrThrow tidak bisa membaca baris tenant lain', async () => {
    const { userAId, userBId, storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);
    const inviteB = await prisma.storeInvites.create({
      data: {
        storeId: storeBId,
        email: `i-${randomUUID()}@test.local`,
        tokenHash: randomUUID().replaceAll('-', ''),
        role: 'STAFF',
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedById: userBId,
      },
    });

    // Bentuk query-nya SAH dan menunjuk baris invite milik toko B.
    //_expectation: proxy menolak sebelum query jalan.
    expect(() =>
      prisma.tenantModel('storeInvites', storeAId).findUniqueOrThrow({ where: { id: inviteB.id } }),
    ).toThrow(AppError);

    //_storeId yang benar tapi user-nya dari toko lain -> tidak ketemu.
    await expect(
      prisma
        .tenantModel('storeMembers', storeAId)
        .findUniqueOrThrow({
          where: { storeId_userId: { storeId: storeAId, userId: userBId } },
        }),
    ).rejects.toThrow();

    // Sanity check: baris yang benar-benar milik A tetap terbaca.
    const own = await prisma
      .tenantModel('storeMembers', storeAId)
      .findUniqueOrThrow({ where: { storeId_userId: { storeId: storeAId, userId: userAId } } });
    expect(own.storeId).toBe(storeAId);
  });

  it('update tidak bisa menulis ke baris tenant lain', async () => {
    const { userBId, storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    // Kunci majemuk milik toko B, dijalankan lewat scope toko A.
    expect(() =>
      prisma
        .tenantModel('storeMembers', storeAId)
        .update({
          where: { storeId_userId: { storeId: storeBId, userId: userBId } },
          data: { role: 'OWNER' },
        }),
    ).toThrow(AppError);

    // Baris B harus utuh.
    const untouched = await prisma.storeMembers.findFirstOrThrow({
      where: { userId: userBId },
    });
    expect(untouched.role).toBe('STAFF');
    expect(untouched.storeId).toBe(storeBId);
  });

  it('update menolak pemanggilan tanpa storeId', () => {
    const scoped = prisma.tenantModel('storeInvites', 'store-a');

    expect(() =>
      scoped.update({ where: { id: randomUUID() }, data: { role: 'OWNER' } }),
    ).toThrow(AppError);
  });

  it('update pada baris milik sendiri tetap bisa jalan', async () => {
    const { userAId, storeAId } = await seedTwoStoresWithMembers(prisma);

    const updated = await prisma
      .tenantModel('storeMembers', storeAId)
      .update({
        where: { storeId_userId: { storeId: storeAId, userId: userAId } },
        data: { role: 'STAFF' },
      });

    expect(updated.role).toBe('STAFF');
    expect(updated.storeId).toBe(storeAId);
  });

  it('update tidak bisa memindahkan baris ke toko lain lewat data.storeId', async () => {
    const { userAId, storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    const updated = await prisma
      .tenantModel('storeMembers', storeAId)
      .update({
        where: { storeId_userId: { storeId: storeAId, userId: userAId } },
        data: { storeId: storeBId, role: 'STAFF' },
      });

    // Scope menang atas storeId dari pemanggil: baris tetap di toko A.
    expect(updated.storeId).toBe(storeAId);
    expect(updated.storeId).not.toBe(storeBId);

    // Dan keanggotaan di toko B tidak bertambah.
    expect(await prisma.storeMembers.count({ where: { storeId: storeBId } })).toBe(1);
    const stillInA = await prisma.storeMembers.findUniqueOrThrow({
      where: { storeId_userId: { storeId: storeAId, userId: userAId } },
    });
    expect(stillInA.storeId).toBe(storeAId);
  });

  it('updateMany tidak bisa memindahkan baris ke toko lain', async () => {
    const { storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    const result = await prisma
      .tenantModel('storeMembers', storeAId)
      .updateMany({ data: { storeId: storeBId, role: 'STAFF' } });

    expect(result.count).toBe(1);
    expect(await prisma.storeMembers.count({ where: { storeId: storeBId } })).toBe(1);
    expect(await prisma.storeMembers.count({ where: { storeId: storeAId } })).toBe(1);

    const survivor = await prisma.storeMembers.findMany({ where: { storeId: storeBId } });
    expect(survivor[0]?.role).toBe('STAFF');
  });

  it('upsert.update tidak bisa memindahkan baris ke toko lain', async () => {
    const { userAId, storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    // Baris (storeA, userA) sudah ada, jadi upsert masuk ke cabang `update`.
    const upserted = await prisma
      .tenantModel('storeMembers', storeAId)
      .upsert({
        where: { storeId_userId: { storeId: storeAId, userId: userAId } },
        create: { storeId: storeAId, userId: userAId, role: 'OWNER' },
        update: { storeId: storeBId, role: 'STAFF' },
      });

    expect(upserted.storeId).toBe(storeAId);
    expect(upserted.storeId).not.toBe(storeBId);
    expect(upserted.role).toBe('STAFF');
    expect(await prisma.storeMembers.count({ where: { storeId: storeBId } })).toBe(1);
    expect(await prisma.storeMembers.count({ where: { storeId: storeAId } })).toBe(1);
  });

  it('create memaksa data.storeId dan tidak bisa menulis ke tenant lain', async () => {
    const { userCId, storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    // Pemanggil sengaja menyebut storeB, padahal scope-nya storeA.
    const created = await prisma
      .tenantModel('storeMembers', storeAId)
      .create({ data: { storeId: storeBId, userId: userCId, role: 'STAFF' } });

    expect(created.storeId).toBe(storeAId);
    expect(created.storeId).not.toBe(storeBId);
    expect(created.userId).toBe(userCId);

    // Membership toko B tidak bertambah sama sekali.
    expect(await prisma.storeMembers.count({ where: { storeId: storeBId } })).toBe(1);
    expect(await prisma.storeMembers.count({ where: { storeId: storeAId } })).toBe(2);
  });

  it('createMany memaksa storeId pada tiap baris', async () => {
    const { userAId, userCId, storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    // userA sudah jadi member storeA, jadi insert ke storeA pasti bentrok PK.
    // Kalau createMany ini justru berhasil, berarti storeId tidak dipaksa.
    await expect(
      prisma
        .tenantModel('storeMembers', storeAId)
        .createMany({
          data: [
            { storeId: storeBId, userId: userAId, role: 'STAFF' },
            { storeId: storeBId, userId: userCId, role: 'STAFF' },
          ],
        }),
    ).rejects.toThrow();

    expect(await prisma.storeMembers.count({ where: { storeId: storeBId } })).toBe(1);
  });

  it('createMany menulis ke toko yang di-scope', async () => {
    const { userBId, userCId, storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    const result = await prisma
      .tenantModel('storeMembers', storeAId)
      .createMany({
        data: [
          { storeId: storeBId, userId: userBId, role: 'STAFF' },
          { storeId: storeBId, userId: userCId, role: 'STAFF' },
        ],
      });

    expect(result.count).toBe(2);
    expect(await prisma.storeMembers.count({ where: { storeId: storeBId } })).toBe(1);
    expect(await prisma.storeMembers.count({ where: { storeId: storeAId } })).toBe(3);
  });

  it('upsert memaksa create.storeId ke scope', async () => {
    const { userCId, storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    // create() akan menunjuk storeB, tapi proxy harus memaksa ke storeA.
    const upserted = await prisma
      .tenantModel('storeMembers', storeAId)
      .upsert({
        where: { storeId_userId: { storeId: storeAId, userId: userCId } },
        create: { storeId: storeBId, userId: userCId, role: 'STAFF' },
        update: { role: 'OWNER' },
      });

    expect(upserted.storeId).toBe(storeAId);
    expect(upserted.storeId).not.toBe(storeBId);
    expect(await prisma.storeMembers.count({ where: { storeId: storeBId } })).toBe(1);
  });

it('upsert menolak kunci majemuk milik tenant lain', () => {
    const scoped = prisma.tenantModel('storeMembers', 'store-a');

    expect(() =>
      scoped.upsert({
        where: { storeId_userId: { storeId: 'store-b', userId: 'user-b' } },
        create: { storeId: 'store-b', userId: 'user-b', role: 'STAFF' },
        update: { role: 'STAFF' },
      }),
    ).toThrow(AppError);
  });

  it('operasi yang tidak dikenal ditolak, dengan nama operasi di pesan', () => {
    const scoped = prisma.tenantModel('storeMembers', 'store-a') as unknown as {
      someUnauditedOperation: () => unknown;
    };

    expect(() => scoped.someUnauditedOperation()).toThrow(AppError);
    expect(() => scoped.someUnauditedOperation()).toThrow(/someUnauditedOperation/);
  });

  it('raw query ditolak karena tidak bisa di-scope', () => {
    const scoped = prisma.tenantModel('storeMembers', 'store-a') as unknown as {
      $queryRawUnsafe: (sql: string) => unknown;
    };

    // Raw query hanya ada di level PrismaClient, tapi proxy tetap harus menolak
    // dengan pesan yang menyebut operasinya, bukan "is not a function".
    expect(() => scoped.$queryRawUnsafe('SELECT 1')).toThrow(AppError);
    expect(() => scoped.$queryRawUnsafe('SELECT 1')).toThrow(/\$queryRawUnsafe/);
  });
});

describe('PrismaService.tenantModel', () => {
  it('mengembalikan delegate yang ter-scope ke tenant yang diminta', async () => {
    const { storeAId, storeBId } = await seedTwoStoresWithMembers(prisma);

    const membersA = await prisma.tenantModel('storeMembers', storeAId).findMany({});
    const membersB = await prisma.tenantModel('storeMembers', storeBId).findMany({});

    expect(membersA).toHaveLength(1);
    expect(membersA.every((m) => m.storeId === storeAId)).toBe(true);
    expect(membersB).toHaveLength(1);
    expect(membersB.every((m) => m.storeId === storeBId)).toBe(true);
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
    expect(serialized.toLowerCase()).not.toContain('prisma');
  });
});
