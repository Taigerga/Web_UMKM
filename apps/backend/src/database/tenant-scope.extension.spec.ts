import { describe, expect, it } from 'vitest';
// Tipe baris hasil generate. `client.ts` mengekspor tipe model dengan nama
// huruf kecil yang sama dengan nama model Prisma.
import type {
  storeInvites,
  storeMembers,
} from '../generated/prisma/client.js';
import { AppError } from '../common/errors/app-error.js';
import {
  TENANT_MODELS,
  isTenantModel,
  withTenantScope,
  type TenantModelName,
} from './tenant-scope.extension.js';

type Captured = { operation: string; args: Record<string, unknown> };

/** Delegate tiruan: setiap operasi dicatat, lalu mengembalikan array kosong. */
interface SpyDelegate {
  findMany(args?: Record<string, unknown>): Promise<unknown>;
  findFirst(args?: Record<string, unknown>): Promise<unknown>;
  findFirstOrThrow(args?: Record<string, unknown>): Promise<unknown>;
  count(args?: Record<string, unknown>): Promise<unknown>;
  aggregate(args?: Record<string, unknown>): Promise<unknown>;
  updateMany(args?: Record<string, unknown>): Promise<unknown>;
  deleteMany(args?: Record<string, unknown>): Promise<unknown>;
  groupBy(args?: Record<string, unknown>): Promise<unknown>;
  create(args?: Record<string, unknown>): Promise<unknown>;
  findUnique(args?: Record<string, unknown>): Promise<unknown>;
  // Tidak pernah boleh diteruskan.
  $queryRawUnsafe(args: string): Promise<unknown>;
  somethingNobodyAudited(args?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Delegate tiruan yang mencatat argumen yang diteruskannya.
 *
 * Ini murni test double di dalam unit test - jalur inti tidak memakai mock.
 * Perilaku database sungguhan dibuktikan di `test/database.e2e.spec.ts`.
 */
function createSpyDelegate(captured: Captured[]): SpyDelegate {
  const record =
    (operation: string) =>
    (args: Record<string, unknown> = {}): Promise<unknown> => {
      captured.push({ operation, args });
      return Promise.resolve([]);
    };
  return {
    findMany: record('findMany'),
    findFirst: record('findFirst'),
    findFirstOrThrow: record('findFirstOrThrow'),
    count: record('count'),
    aggregate: record('aggregate'),
    updateMany: record('updateMany'),
    deleteMany: record('deleteMany'),
    groupBy: record('groupBy'),
    create: record('create'),
    findUnique: record('findUnique'),
    $queryRawUnsafe: (raw: string) => {
      captured.push({ operation: '$queryRawUnsafe', args: { raw } });
      return Promise.resolve([]);
    },
    somethingNobodyAudited: record('somethingNobodyAudited'),
  };
}

const STORE_ID = '11111111-1111-1111-1111-111111111111';

// ---------------------------------------------------------------------------
// Tripwire kompilasi: setiap anggota TENANT_MODELS harus punya kolom storeId.
// ---------------------------------------------------------------------------
//
// Ini yang menahan bug "stores masuk TENANT_MODELS": `stores` type-check sebagai
// tenant model karena TenantModelName diturunkan dari array-nya, lalu gagal saat
// runtime dengan PrismaClientValidationError karena tabelnya tidak punya
// kolom `storeId`.

type RowOf<K extends TenantModelName> = K extends 'storeMembers'
  ? storeMembers
  : K extends 'storeInvites'
    ? storeInvites
    : // Sengaja tidak punya `storeId` supaya assertion di bawah GAGAL.
      { __bukanModelTenant: K };

type HasStoreId<T> = T extends { storeId: unknown } ? true : false;
type Assert<T extends true> = T;

/**
 * Tripwire otomatis, bukan daftar manual.
 *
 * `RowOf` adalah conditional type distributif, jadi diinstansiasi dengan
 * `TenantModelName` (union dari `TENANT_MODELS`) ia menguji SETIAP anggota dan
 * menggabungkan hasilnya. Begitu satu anggota tidak punya `storeId`,
 * hasilnya jadi `boolean` dan `Assert` gagal mengompilasi.
 *
 * Kalau ada model tenant baru, tambahkan petanya di `RowOf`. Kalau model itu
 * ternyata tidak punya kolom `storeId`, baris di bawah ini yang gagal - bukan
 * bug yang lolos ke produksi.
 */
type EveryTenantModelHasStoreId = Assert<HasStoreId<RowOf<TenantModelName>>>;

/**
 * Variabel ini yang membuat `EveryTenantModelHasStoreId` benar-benar
 * dievaluasi TypeScript. Alias tipe yang tidak dipakai tidak akan dicek sama
 * sekali, jadi rujukan ini yang mengaktifkan tripwire-nya.
 */
const _typecheckTripwire: EveryTenantModelHasStoreId | undefined = undefined;

describe('TENANT_MODELS', () => {
  it('tripwire tipe: setiap anggota punya kolom storeId', () => {
    // reachable == sudah lulus kompilasi
    expect(_typecheckTripwire).toBeUndefined();
  });

  it('hanya memuat model yang punya kolom storeId', () => {
    // `stores` sengaja tidak boleh ada di sini.
    expect(TENANT_MODELS).toEqual(['storeMembers', 'storeInvites']);
    expect(TENANT_MODELS).not.toContain('stores');
    expect(TENANT_MODELS).not.toContain('users');
    expect(TENANT_MODELS).not.toContain('auditLogs');
  });

  it('isTenantModel menolak model di luar daftar', () => {
    expect(isTenantModel('storeMembers')).toBe(true);
    expect(isTenantModel('storeInvites')).toBe(true);
    expect(isTenantModel('stores')).toBe(false);
    expect(isTenantModel('users')).toBe(false);
    expect(isTenantModel('auditLogs')).toBe(false);
    expect(isTenantModel('refreshTokens')).toBe(false);
  });
});

describe('withTenantScope', () => {
  it('menolak storeId kosong dengan AppError.forbidden', () => {
    const delegate = createSpyDelegate([]);
    expect(() => withTenantScope(delegate, '')).toThrow(AppError);
    expect(() => withTenantScope(delegate, '   ')).toThrow(AppError);
  });

  it('menyuntikkan where.storeId ke operasi berbasis filter', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    await scoped.findMany({});
    await scoped.findFirst({});
    await scoped.findFirstOrThrow({});
    await scoped.count();
    await scoped.aggregate({});
    await scoped.updateMany({});
    await scoped.deleteMany({});

    const injected = captured.filter((c) => c.operation !== 'aggregate');
    for (const call of injected) {
      expect(call.args['where']).toEqual({ storeId: STORE_ID });
    }
    // aggregate juga wajib ter-scope, kalau tidak menjumlahkan semua tenant.
    expect(captured.find((c) => c.operation === 'aggregate')?.args['where']).toEqual({
      storeId: STORE_ID,
    });
  });

  it('groupBy menyuntik where DAN menambahkan storeId ke by', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    await scoped.groupBy({ by: ['role'] });

    expect(captured[0]?.args['where']).toEqual({ storeId: STORE_ID });
    // Tanpa storeId di `by`, grup bisa menjangkau lebih dari satu tenant.
    expect(captured[0]?.args['by']).toEqual(['role', 'storeId']);
  });

  it('groupBy tidak menambahkan storeId dua kali', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    await scoped.groupBy({ by: ['storeId', 'role'] });

    expect(captured[0]?.args['by']).toEqual(['storeId', 'role']);
  });

  it('create memaksa data.storeId dan mengabaikan storeId dari pemanggil', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    await scoped.create({ data: { storeId: 'store-orang-lain', userId: 'u1' } });

    expect(captured[0]?.args['data']).toEqual({ storeId: STORE_ID, userId: 'u1' });
  });

  it('mempertahankan filter where milik pemanggil', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    await scoped.findMany({ where: { role: 'OWNER' } });

    expect(captured[0]?.args['where']).toEqual({
      role: 'OWNER',
      storeId: STORE_ID,
    });
  });

  it('scope selalu menang atas storeId toko lain yang dicoba pemanggil', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    await scoped.findMany({ where: { storeId: 'store-orang-lain' } });

    expect(captured[0]?.args['where']).toEqual({ storeId: STORE_ID });
  });

  it('unique-input menolak pemanggilan tanpa where.storeId', () => {
    const scoped = withTenantScope(createSpyDelegate([]), STORE_ID);

    expect(() => scoped.findUnique({ where: { id: 'x' } })).toThrow(AppError);
  });

  it('unique-input menolak where.storeId milik tenant lain', () => {
    const scoped = withTenantScope(createSpyDelegate([]), STORE_ID);

    expect(() =>
      scoped.findUnique({ where: { id: 'x', storeId: 'store-orang-lain' } }),
    ).toThrow(AppError);
  });

  it('unique-input meneruskan pemanggilan yang storeId-nya cocok', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    await scoped.findUnique({ where: { id: 'x', storeId: STORE_ID } });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.operation).toBe('findUnique');
  });

  it('raw query ditolak', () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    expect(() => scoped.$queryRawUnsafe('SELECT 1')).toThrow(AppError);
    expect(captured).toHaveLength(0);
  });

  it('operasi yang tidak dikenal ditolak, dengan nama operasi di pesan', () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    expect(() => scoped.somethingNobodyAudited({})).toThrow(/somethingNobodyAudited/);
    // Default-deny: tidak boleh sampai ke delegate.
    expect(captured).toHaveLength(0);
  });

  it('tidak mengubah argumen yang diberikan pemanggil', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);
    const args = { where: { role: 'STAFF' } };

    await scoped.findMany(args);

    expect(args).toEqual({ where: { role: 'STAFF' } });
  });
});
