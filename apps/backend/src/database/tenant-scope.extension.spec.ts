import { describe, expect, it } from 'vitest';
import { AppError } from '../common/errors/app-error.js';
import { TENANT_MODELS, withTenantScope } from './tenant-scope.extension.js';

type Captured = { operation: string; args: Record<string, unknown> };

/** Delegate tiruan: setiap operasi dicatat, lalu mengembalikan array kosong. */
interface SpyDelegate {
  findMany(args?: Record<string, unknown>): Promise<unknown>;
  findFirst(args?: Record<string, unknown>): Promise<unknown>;
  count(args?: Record<string, unknown>): Promise<unknown>;
  updateMany(args?: Record<string, unknown>): Promise<unknown>;
  deleteMany(args?: Record<string, unknown>): Promise<unknown>;
  findUnique(args?: Record<string, unknown>): Promise<unknown>;
  create(args?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Delegate tiruan yang mencatat argumen yang diteruskannya.
 *
 * Ini murni test double di dalam unit test — jalur inti tidak memakai mock.
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
    count: record('count'),
    updateMany: record('updateMany'),
    deleteMany: record('deleteMany'),
    // Tidak boleh disentuh scoping.
    findUnique: record('findUnique'),
    create: record('create'),
  };
}

const STORE_ID = '11111111-1111-1111-1111-111111111111';

describe('TENANT_MODELS', () => {
  it('mencakup model Fase 1 yang punya kolom storeId', () => {
    expect(TENANT_MODELS).toEqual(['stores', 'storeMembers', 'storeInvites']);
  });
});

describe('withTenantScope', () => {
  it('menolak storeId kosong dengan AppError.forbidden', () => {
    const delegate = createSpyDelegate([]);
    expect(() => withTenantScope(delegate, '')).toThrow(AppError);
    expect(() => withTenantScope(delegate, '   ')).toThrow(AppError);
  });

  it('menyuntikkan where.storeId ke lima operasi yang di-scope', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    await scoped.findMany({});
    await scoped.findFirst({});
    await scoped.count();
    await scoped.updateMany({});
    await scoped.deleteMany({});

    expect(captured.map((c) => c.operation)).toEqual([
      'findMany',
      'findFirst',
      'count',
      'updateMany',
      'deleteMany',
    ]);
    for (const call of captured) {
      expect(call.args['where']).toEqual({ storeId: STORE_ID });
    }
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

  it('tidak menyentuh operasi di luar daftar scope', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);

    await scoped.findUnique({ where: { id: 'apa-saja' } });
    await scoped.create({ data: { name: 'x' } });

    expect(captured.map((c) => c.operation)).toEqual(['findUnique', 'create']);
    // Argumen diteruskan apa adanya: tidak ada `storeId` yang disuntik.
    expect(captured[0]?.args['where']).toEqual({ id: 'apa-saja' });
    expect(captured[1]?.args).toEqual({ data: { name: 'x' } });
  });

  it('tidak mengubah argumen yang diberikan pemanggil', async () => {
    const captured: Captured[] = [];
    const scoped = withTenantScope(createSpyDelegate(captured), STORE_ID);
    const args = { where: { role: 'STAFF' } };

    await scoped.findMany(args);

    expect(args).toEqual({ where: { role: 'STAFF' } });
  });
});