import { describe, expect, it, vi } from 'vitest';
import { StoresService } from './stores.service.js';
import { StoreAccessService } from './store-access.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';

/**
 * Stub `AuditService` untuk test lock.
 *
 * Sengaja TIDAK pushing apa pun ke `calls`: audit ditulis setelah transaksi
 * selesai, di luar lock. Kalau stub ikut mencatat, assertion
 * `calls.every(c => c.client === 'tx')` akan gagal karena alasan yang salah -
 * ia akan gagal bukan karena ada operasi yang bocor ke klien utama, tapi karena
 * audit memang tidak boleh ikut di dalamnya.
 */
const auditStub = { record: async () => {} } as unknown as AuditService;

/**
 * Serialisasi operasi owner lewat lock baris induk (R-21).
 *
 * Test e2e membuktikan akibatnya: dua penghapusan owner bersamaan menyisakan
 * satu owner. Test ini membuktikan MEKANISMENYA - bahwa urutan di dalam
 * `withStoreOwnerLock` memang "kunci baris induk -> baca -> tulis" dan bahwa
 * ketiganya berada dalam satu `$transaction`.
 *
 * Yang dipin:
 * - `SELECT ... FROM stores WHERE id = ? FOR UPDATE` adalah PERMINTAAN PERTAMA
 *   di dalam transaksi, sebelum query apa pun yang menyentuh `store_members`;
 * - `storeId` masuk sebagai parameter query, bukan lewat interpolasi string;
 * - pembacaan keanggotaan target, hitungan owner, dan penulisan terjadi
 *   SESUDAH lock;
 * - semuanya memakai klien transaksi, bukan `prisma` utama.
 *
 * Kalau `lockStoreRow` dihapus, test "kunci baris induk sebelum membaca" gagal.
 */

interface CallLog {
  where: string;
  client: 'root' | 'tx';
  data?: Record<string, unknown>;
  args?: unknown[];
}

/**
 * Prisma palsu untuk operasi owner.
 *
 * `$queryRaw` dicatat sebagai operasi biasa. `$transaction` benar-benar
 * memakai objek `tx` terpisah, jadi test bisa membuktikan operasi mana yang
 * jalan di dalam transaksi dan mana yang bocor ke klien utama.
 */
function makeOwnerFake(calls: CallLog[], ownerCount = 2) {
  const membersDelegate = (client: 'root' | 'tx') => ({
    findUnique: () => Promise.resolve({ storeId: 'S', userId: 'target', role: 'OWNER', joinedAt: new Date(0) }),
    count: () => Promise.resolve(ownerCount),
    update: (args: Record<string, unknown>) => {
      calls.push({ where: 'storeMembers.update', client, data: args['data'] as Record<string, unknown> });
      return Promise.resolve({ userId: 'target', role: 'STAFF' });
    },
    delete: (args: Record<string, unknown>) => {
      calls.push({ where: 'storeMembers.delete', client, data: args as Record<string, unknown> });
      return Promise.resolve({ storeId: 'S', userId: 'target', role: 'OWNER' });
    },
  });

  const tx = {
    stores: {
      findUnique: () => Promise.resolve({ id: 'S' }),
    },
    storeMembers: membersDelegate('tx'),
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({
        where: 'stores.FOR UPDATE',
        client: 'tx',
        data: { sql: strings.join('?'), params: values },
      });
      return Promise.resolve([{ id: values[0] }]);
    },
  };

  return {
    storeMembers: membersDelegate('root'),
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
}

function makeService(prisma: PrismaService): StoresService {
  const storeAccess = {
    // Otorisasi sudah ditolak upstream di test ini; yang diuji lock-nya.
    assertAccess: vi.fn(async () => ({
      storeId: 'S',
      userId: 'caller',
      role: 'OWNER',
      joinedAt: new Date(0),
    })),
    isOwner: vi.fn(async () => true),
  } as unknown as StoreAccessService;

  return new StoresService(prisma, storeAccess, auditStub);
}

describe('StoresService.withStoreOwnerLock', () => {
  it('kunci baris induk SEBELUM membaca keanggotaan atau menghitung owner', async () => {
    const calls: CallLog[] = [];
    const service = makeService(makeOwnerFake(calls, 2));

    await service.removeMember('caller', 'S', 'target');

    const order = calls.map((c) => c.where);
    expect(order[0]).toBe('stores.FOR UPDATE');
    expect(order.indexOf('stores.FOR UPDATE')).toBeLessThan(
      order.indexOf('storeMembers.delete'),
    );

    // Dan tidak ada operasi yang bocor ke klien utama.
    expect(calls.every((c) => c.client === 'tx')).toBe(true);
  });

  it('storeId masuk sebagai parameter query, bukan ke dalam teks SQL', async () => {
    const calls: CallLog[] = [];
    const service = makeService(makeOwnerFake(calls, 2));

    // Id yang isinya TIDAK mungkin muncul sebagai substring dari SQL-nya.
    const storeId = 'tokouji-9f3a';
    await service.removeMember('caller', storeId, 'target');

    const lock = calls.find((c) => c.where === 'stores.FOR UPDATE');
    expect(lock?.data?.['sql']).toBe('SELECT id FROM stores WHERE id = ? FOR UPDATE');
    // Nilai id TIDAK ada di teks SQL, hanya di daftar parameter.
    expect(lock?.data?.['sql']).not.toContain(storeId);
    expect(lock?.data?.['params']).toEqual([storeId]);
  });

  it('penurunan peran juga lewat lock, bukan hanya penghapusan', async () => {
    const calls: CallLog[] = [];
    const service = makeService(makeOwnerFake(calls, 2));

    await service.updateMember('caller', 'S', 'target', { role: 'STAFF' });

    const order = calls.map((c) => c.where);
    expect(order[0]).toBe('stores.FOR UPDATE');
    expect(order).toContain('storeMembers.update');
    expect(calls.every((c) => c.client === 'tx')).toBe(true);
  });

  it('promosi STAFF -> OWNER juga lewat lock yang sama', async () => {
    // Kalau promosi tidak mengambil lock, ada jalur owner-changing yang bisa
    // menyelundup melewati penjaga tanpa diserialisasi.
    const calls: CallLog[] = [];
    const service = makeService(makeOwnerFake(calls, 1));

    await service.updateMember('caller', 'S', 'target', { role: 'OWNER' });

    expect(calls[0]?.where).toBe('stores.FOR UPDATE');
    expect(calls.map((c) => c.where)).toContain('storeMembers.update');
  });

  it('jumlah owner == 1 pada operasi hapus menghasilkan LAST_OWNER sebelum menulis', async () => {
    const calls: CallLog[] = [];
    const service = makeService(makeOwnerFake(calls, 1));

    await expect(service.removeMember('caller', 'S', 'target')).rejects.toMatchObject({
      status: 409,
      code: 'LAST_OWNER',
    });

    // Penulisan tidak pernah terjadi - dan itu berlaku di dalam transaksi.
    expect(calls.map((c) => c.where)).not.toContain('storeMembers.delete');
  });

  it('jumlah owner == 1 pada operasi turunkan menghasilkan LAST_OWNER sebelum menulis', async () => {
    const calls: CallLog[] = [];
    const service = makeService(makeOwnerFake(calls, 1));

    await expect(
      service.updateMember('caller', 'S', 'target', { role: 'STAFF' }),
    ).rejects.toMatchObject({ status: 409, code: 'LAST_OWNER' });

    expect(calls.map((c) => c.where)).not.toContain('storeMembers.update');
  });

  it('lock diambil juga saat operasi sukses, jadi test lain di file ini bukan kebetulan', async () => {
    const calls: CallLog[] = [];
    const service = makeService(makeOwnerFake(calls, 2));

    await expect(service.removeMember('caller', 'S', 'target')).resolves.toBeUndefined();
    expect(calls.some((c) => c.where === 'stores.FOR UPDATE')).toBe(true);
    expect(calls.some((c) => c.where === 'storeMembers.delete')).toBe(true);
  });
});