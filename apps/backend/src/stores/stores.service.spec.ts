import { describe, expect, it } from 'vitest';
import { StoresService } from './stores.service.js';
import { StoreAccessService } from './store-access.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { AuditEntry, AuditService } from '../audit/audit.service.js';

/**
 * Stub `AuditService`.
 *
 * `record` di-stub dan bukan objek kosong supaya test ini tidak gagal dengan
 * "record is not a function" setiap kali `create` menulis audit - yang diuji
 * di sini adalah transaksinya, bukan auditnya. Stub ini juga mengumpulkan
 * entry-nya, jadi test bisa memeriksa audit tanpa database.
 */
function makeAuditStub(): { audit: AuditService; entries: AuditEntry[] } {
  const entries: AuditEntry[] = [];
  const audit = {
    record: async (entry: AuditEntry) => {
      entries.push(entry);
      // `true` = baris benar-benar ditulis. `StoresService` memeriksa nilai
      // ini pada penulisan dalam-transaksi, jadi stub yang mengembalikan
      // `undefined` akan membuat test gagal karena alasan yang salah.
      return true;
    },
  } as unknown as AuditService;
  return { audit, entries };
}

/**
 * `StoresService.create` harus SATU transaksi (kontrak Task 5).
 *
 * Sifat ini tidak bisa diuji lewat HTTP: kegagalan di tengah transaksi tidak
 * bisa dipancing dari luar tanpa merusak database test. Jadi test ini memakai
 * Prisma PALSU yang mencatat operasi apa yang jalan dan lewat "klien" mana.
 *
 * Yang dipin:
 * - `stores.create` dan `store_members.create` keduanya dijalankan dengan
 *   klien transaksi, bukan dengan `prisma` utama;
 * - keduanya berada di dalam satu pemanggilan `$transaction`;
 * - keanggotaan yang dibuat adalah OWNER untuk `userId` dari argumen;
 * - `createdById` diambil dari argumen `userId`, bukan dari DTO.
 *
 * Kalau `create` diubah menjadi dua `await` terpisah di luar `$transaction`,
 * test "keduanya lewat klien transaksi" gagal - dan itulah property yang
 * membuat toko tanpa owner tidak mungkin terjadi.
 */

/** Catatan operasi yang lewat ke fake, urut. */
interface CallLog {
  where: string;
  client: 'root' | 'tx';
  data?: Record<string, unknown>;
}

function makeFakePrisma(calls: CallLog[], failOn?: string) {
  const storesCreate = (data: Record<string, unknown>) => {
    calls.push({ where: 'stores.create', client: 'root', data });
    return Promise.resolve({
      id: 'store-1',
      name: 'Warung',
      city: 'Bandung',
      timezone: 'Asia/Jakarta',
      status: 'ACTIVE',
    });
  };

  const membersCreate = (data: Record<string, unknown>) => {
    calls.push({ where: 'storeMembers.create', client: 'root', data });
    return Promise.resolve({});
  };

  // Klien transaksi: mencatat bahwa operasinya terjadi di dalam `$transaction`,
    // dan melempar kalau test yang harus gagal.
  const tx = {
    stores: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ where: 'stores.create', client: 'tx', data });
        if (failOn === 'stores') throw new Error('toko gagal dibuat');
        return Promise.resolve({
          id: 'store-1',
          name: 'Warung',
          city: 'Bandung',
          timezone: 'Asia/Jakarta',
          status: 'ACTIVE',
        });
      },
    },
    storeMembers: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ where: 'storeMembers.create', client: 'tx', data });
        if (failOn === 'storeMembers') {
          throw new Error('keanggotaan gagal dibuat');
        }
        return Promise.resolve({});
      },
    },
  };

  return {
    stores: { create: storesCreate },
    storeMembers: { create: membersCreate },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
}

function makeService(prisma: PrismaService): StoresService {
  return makeServiceWithAudit(prisma).service;
}

/** Service plus stub audit-nya, untuk test yang memeriksa audit. */
function makeServiceWithAudit(prisma: PrismaService): {
  service: StoresService;
  entries: AuditEntry[];
} {
  // `create` tidak menyentuh `StoreAccessService`, jadi stub kosong cukup - dan
  // memang disengaja: kalau `create` nanti mulai butuh akses, test ini akan
  // gagal dengan "not a function" alih-alih diam-diam lolos.
  const stub = makeAuditStub();
  return {
    service: new StoresService(prisma, {} as StoreAccessService, stub.audit),
    entries: stub.entries,
  };
}

describe('StoresService.create: satu transaksi', () => {
  it('toko dan keanggotaan OWNER dibuat dalam satu $transaction', async () => {
    const calls: CallLog[] = [];
    const service = makeService(makeFakePrisma(calls));

    const result = await service.create('user-1', { name: '  Warung  ', city: ' Bandung ' });

    // Keduanya lewat klien transaksi, tidak ada satu pun lewat root.
    expect(calls.map((c) => c.where)).toEqual(['stores.create', 'storeMembers.create']);
    expect(calls.every((c) => c.client === 'tx')).toBe(true);

    // Baris keanggotaan: OWNER untuk user yang memanggil.
    expect(calls[1]?.data).toEqual({
      storeId: 'store-1',
      userId: 'user-1',
      role: 'OWNER',
    });

    // `createdById` dari argumen, bukan dari DTO - dan DTO tidak punya field itu.
    expect(calls[0]?.data).toMatchObject({ createdById: 'user-1' });

    // Nilai]string dipangkas, dan `city` yang tidak dikirim tidak muncul.
    expect(calls[0]?.data).toMatchObject({ name: 'Warung', city: 'Bandung' });

    // Respons menyatakan peran pembuat adalah OWNER.
    expect(result.role).toBe('OWNER');
  });

  it('city yang tidak dikirim tidak pernah masuk ke query sebagai undefined eksplisit', async () => {
    const calls: CallLog[] = [];
    const service = makeService(makeFakePrisma(calls));

    await service.create('user-1', { name: 'Warung' });

    expect('city' in (calls[0]?.data ?? {})).toBe(false);
  });

  it('kegagalan pembuatan keanggotaan menggagalkan seluruh pembuatan toko', async () => {
    // Fake ini melempar saat `storeMembers.create` di dalam transaksi. Karena
    // `stores.create` juga berjalan di dalam `$transaction` yang sama, tidak
    // pernah ada toko yang berdiri tanpa owner sebagai hasil yang terlihat, dan
    // pemanggil tetap menerima error - bukan toko yatim.
    const calls: CallLog[] = [];
    const service = makeService(makeFakePrisma(calls, 'storeMembers'));

    await expect(service.create('user-1', { name: 'Warung' })).rejects.toThrow(
      'keanggotaan gagal dibuat',
    );

    // Baris toko sempat tercatat di dalam transaksi, tapi itu belum commit:
    // yang diuji di sini adalah bahwa TIDAK ADA jalur yang meloloskan toko
    // tanpa keanggotaan sebagai hasil yang terlihat.
    expect(calls.map((c) => c.client)).toEqual(['tx', 'tx']);
  });

  it('kegagalan pembuatan toko tidak pernah menyentuh store_members', async () => {
    const calls: CallLog[] = [];
    const service = makeService(makeFakePrisma(calls, 'stores'));

    await expect(service.create('user-1', { name: 'Warung' })).rejects.toThrow(
      'toko gagal dibuat',
    );
    // Toko sempat tercatat di dalam transaksi, tapi baris keanggotaan TIDAK
    // pernah dicoba: tidak ada anggota dari toko yang tidak jadi apa pun.
    expect(calls.map((c) => c.where)).toEqual(['stores.create']);
  });

  it('audit store.created menunjuk toko dan pemanggil yang benar', async () => {
    const { service, entries } = makeServiceWithAudit(makeFakePrisma([]));

    await service.create('user-1', { name: 'Warung', city: 'Bandung' });

    expect(entries).toEqual([
      {
        actorId: 'user-1',
        storeId: 'store-1',
        action: 'store.created',
        entity: 'store',
        entityId: 'store-1',
      },
    ]);
  });

  it('audit tidak pernah membawa nama atau kota toko', async () => {
    // `store.updated` sengaja hanya mencatat NAMA kolom yang berubah. Kalau
    // `store.created` mulai membawa nilai, itu keputusan yang harus terlihat di
    // diff allowlist - bukan masuk diam-diam lewat `meta` bebas.
    const { service, entries } = makeServiceWithAudit(makeFakePrisma([]));

    await service.create('user-1', { name: 'Warung Rahasia', city: 'Bandung' });

    expect(JSON.stringify(entries)).not.toContain('Warung Rahasia');
    expect(JSON.stringify(entries)).not.toContain('Bandung');
    expect(entries[0]).not.toHaveProperty('meta');
  });

  it('toko yang gagal dibuat tidak menulis audit sama sekali', async () => {
    // Audit ditulis SETELAH commit. Kalau ditulis di dalam `$transaction`, baris
    // audit ikut hilang saat transaksi di-rollback - persis di saat jejaknya
    // paling perlu ditelusuri.
    const { service, entries } = makeServiceWithAudit(makeFakePrisma([], 'stores'));

    await expect(service.create('user-1', { name: 'Warung' })).rejects.toThrow();

    expect(entries).toEqual([]);
  });
});