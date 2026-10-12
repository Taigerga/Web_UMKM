import { describe, expect, it } from 'vitest';
import { StoresService } from './stores.service.js';
import { StoreAccessService } from './store-access.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuditWriter } from '../audit/audit.service.js';

/**
 * Baris audit keanggotaan ditulis DI DALAM transaksi yang sama dengan
 * perubahannya (findings Task 6, round 1).
 *
 * ## Kenapa hanya dua peristiwa ini yang perlu diuji begini
 *
 * Mayoritas audit ditulis SETELAH commit, dan itu benar: kalau transaksinya
 * batal, jejaknya juga harus batal. Menuliskannya di dalam `$transaction`
 * `create` justru membuat baris audit ikut hilang saat commit gagal, dan unit
 * test `toko yang gagal dibuat tidak menulis audit sama sekali` sudah menjaganya.
 *
 * Tapi dua peristiwa ini tidak bisa direkonstruksi setelah commit:
 * `store.member_removed` - barisnya dihapus - dan `store.member_role_changed` -
 * peran lamanya ditimpa. Kalau penulisan audit gagal setelah commit, tidak ada
 * yang tersisa untuk dicari, dan `AuditService` tidak melempar (R-23), jadi
 * tidak ada yang memberitahu.
 *
 * ## Yang dipin
 *
 * - Penulisan audit memakai klien TRANSAKSI, bukan klien utama. Murni tata letak
 *   kode ("dipanggil di dalam callback") tidak cukup: kalau masih lewat klien
 *   utama, barisnya benar-benar ditulis di koneksi terpisah dan tidak pernah
 *   ikut rollback.
 * - Rollback menghapus KEDUA hal. Kalau hanya audit yang hilang saat rollback,
 *   tabel akan berisi "anggota dicabut" untuk anggota yang masih jadi anggota -
 *   lebih buruk dari tidak mencatat sama sekali.
 * - Commit menyisakan tepat SATU baris, dengan peran yang benar.
 *
 * ## Apa yang TIDAK dibuktikan
 *
 * Rollback MySQL itu sendiri. Yang diuji adalah bahwa audit dan perubahan
 * ditulis lewat klien transaksi yang sama, jadi basis datanya tidak bisa
 * memisahkan keduanya.
 */

/** Entri audit yang diterima, beserta klien yang menerimanya. */
interface RecordedEntry {
  action: string;
  meta?: Record<string, unknown>;
  via: 'tx' | 'root';
}

/**
 * Stub `AuditService` yang mencatat klien mana yang menerimanya, lalu BENAR-BENAR
 * menulis lewat klien itu.
 *
 * Penulisannya ikut lewat stub, bukan dilewati: kalau tidak, jurnal transaksi
 * di fake tidak pernah terisi dan test "commit menyisakan baris audit" akan
 * selalu gagal karena alasan yang salah.
 *
 * Kalau pemanggil tidak mengoper klien apa pun, `via` jadi `'root'` - itulah
 * tanda penulisan terjadi di koneksi terpisah, di luar transaksi.
 */
function makeAuditStub(): { audit: AuditService; entries: RecordedEntry[] } {
  const entries: RecordedEntry[] = [];

  const record = async (
    entry: { action: string; meta?: Record<string, unknown> },
    client?: AuditWriter,
  ) => {
    entries.push({ action: entry.action, meta: entry.meta, via: client ? 'tx' : 'root' });

    // Tanpa klien, penulisan terjadi di koneksi terpisah. Dia tetap dicatat
    // supaya test gagal pada ASSERTION yang bermakna (`via` harus `'tx'`),
    // bukan pada error tak terkait.
    const writer = client as
      | { auditLogs: { create(args: { data: unknown }): Promise<unknown> } }
      | undefined;

    if (writer) await writer.auditLogs.create({ data: entry });

    return true;
  };

  return { audit: { record } as unknown as AuditService, entries };
}

interface FakeState {
  members: string[];
  /** Peran target sebelum operasi; dibaca oleh `findUnique`. */
  role: string;
}

interface MemberFake {
  prisma: PrismaService;
  /** Apakah ada baris audit yang benar-benar ter-commit. */
  isAuditCommitted: () => boolean;
}

/**
 * Prisma palsu yang memodelkan commit/rollback.
 *
 * Penulisan di dalam `$transaction` masuk ke jurnal `pending`; jurnal itu hanya
 * dipindahkan ke state committed kalau callback selesai tanpa melempar. Itulah
 * yang membuat test bisa membedakan "keduanya dalam satu transaksi" dari "dua
 * operasi terpisah yang kebetulan berurutan".
 */
interface MemberFakeOptions {
  /** Kegagalan di COMMIT, setelah callback selesai. */
  failOnCommit?: boolean;
  /**
   * Kegagalan pada INSERT audit yang me-rollback SELURUH transaksi, seperti
   * InnoDB pada deadlock.
   */
  deadlockOnAudit?: boolean;
}

function makeMemberFake(
  state: FakeState,
  options: MemberFakeOptions | boolean = {},
): MemberFake {
  const { failOnCommit = false, deadlockOnAudit = false } =
    typeof options === 'boolean' ? { failOnCommit: options } : options;

  const pending: FakeState = { ...state, members: [...state.members] };
  let auditCommitted = false;

  const membersDelegate = (target: FakeState) => ({
    findUnique: ({ where }: { where: { storeId_userId: { userId: string } } }) =>
      Promise.resolve(
        target.members.includes(where.storeId_userId.userId)
          ? {
              storeId: 'S',
              userId: where.storeId_userId.userId,
              role: target.role,
              joinedAt: new Date(0),
            }
          : null,
      ),
    count: () => Promise.resolve(2),
    update: ({ data }: { data: Record<string, unknown> }) => {
      target.role = String(data['role']);
      return Promise.resolve({ userId: 'target', role: target.role });
    },
    delete: ({ where }: { where: { storeId_userId: { userId: string } } }) => {
      target.members = target.members.filter((m) => m !== where.storeId_userId.userId);
      return Promise.resolve({
        storeId: 'S',
        userId: where.storeId_userId.userId,
        role: target.role,
      });
    },
  });

  let auditWrites = 0;

  /**
   * Status transaksi di sisi database.
   *
   * `rolledBackByServer` meniru InnoDB: pada deadlock, transaksi dibatalkan
   * oleh server TANPA memberitahu Prisma lewat error tambahan. Prisma lalu
   * mengirim COMMIT untuk transaksi yang sudah tidak ada, dan MySQL
   * memperlakukannya sebagai commit kosong yang berhasil.
   */
  let rolledBackByServer = false;

  const tx = {
    stores: { findUnique: () => Promise.resolve({ id: 'S', status: 'ACTIVE' }) },
    storeMembers: membersDelegate(pending),
    auditLogs: {
      create: () => {
        auditWrites += 1;
        if (deadlockOnAudit) {
          // Deadlock: SELURUH transaksi dibatalkan, termasuk `pending` yang
          // sudah berisi hasil delete.
          rolledBackByServer = true;
          pending.members = [...state.members];
          pending.role = state.role;
          return Promise.reject(new Error('Deadlock found when trying to get lock'));
        }
        return Promise.resolve({ id: 'audit-1' });
      },
    },
    $queryRaw: () => Promise.resolve([{ id: 'S' }]),
  };

  const prisma = {
    storeMembers: membersDelegate(state),
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
      try {
        const result = await fn(tx);

        if (failOnCommit) throw new Error('commit gagal');

        if (rolledBackByServer) {
          // COMMIT terhadap transaksi yang sudah di-rollback server: dianggap
          // berhasil, dan tidak ada yang tersisa.
          auditCommitted = false;
          return result;
        }

        // Commit: jurnal pending dipindahkan ke state committed.
        state.members = [...pending.members];
        state.role = pending.role;
        auditCommitted = auditWrites > 0;
        return result;
      } catch {
        // Rollback: `state` tidak pernah tersentuh dan tidak ada audit yang
        // dianggap committed.
        auditCommitted = false;
        throw new Error('rollback');
      }
    },
  } as unknown as PrismaService;

  return { prisma, isAuditCommitted: () => auditCommitted };
}

/** StoreAccess yang mengizinkan: yang diuji lock dan audit, bukan otorisasi. */
function allowAccess(): StoreAccessService {
  return {
    assertAccess: async () => ({
      storeId: 'S',
      userId: 'caller',
      role: 'OWNER',
      joinedAt: new Date(0),
    }),
    isOwner: async () => false,
  } as unknown as StoreAccessService;
}

describe('audit keanggotaan ditulis di dalam transaksi yang sama', () => {
  it('removeMember mengirim audit lewat klien transaksi, bukan klien utama', async () => {
    const state: FakeState = { members: ['caller', 'target'], role: 'STAFF' };
    const fake = makeMemberFake(state);
    const { audit, entries } = makeAuditStub();
    const service = new StoresService(fake.prisma, allowAccess(), audit);

    await service.removeMember('caller', 'S', 'target');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'store.member_removed' });
    // Inilah yang diuji: `via: 'tx'`. Kalau stub dipanggil tanpa klien,
    // nilainya `'root'` dan test ini gagal - meskipun pemanggilannya terlihat
    // "di dalam" lock.
    expect(entries[0]!.via).toBe('tx');
    expect(fake.isAuditCommitted()).toBe(true);
  });

  it('updateMember mengirim audit lewat klien transaksi', async () => {
    const state: FakeState = { members: ['caller', 'target'], role: 'STAFF' };
    const fake = makeMemberFake(state);
    const { audit, entries } = makeAuditStub();
    const service = new StoresService(fake.prisma, allowAccess(), audit);

    await service.updateMember('caller', 'S', 'target', { role: 'OWNER' });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'store.member_role_changed' });
    expect(entries[0]!.via).toBe('tx');
  });

  it('commit menyisakan tepat satu baris audit, dengan peran yang benar', async () => {
    const state: FakeState = { members: ['caller', 'target'], role: 'STAFF' };
    const fake = makeMemberFake(state);
    const { audit, entries } = makeAuditStub();
    const service = new StoresService(fake.prisma, allowAccess(), audit);

    await service.removeMember('caller', 'S', 'target');

    expect(entries).toHaveLength(1);
    // Peran target dibaca dari baris yang masih ada, sebelum delete.
    expect(entries[0]!.meta).toEqual({ role: 'STAFF' });
    expect(fake.isAuditCommitted()).toBe(true);
    // Dan keanggotaannya benar-benar hilang - ini operasi yang sukses, bukan
    // half-written.
    expect(state.members).not.toContain('target');
  });

  it('rollback tidak menyisakan baris audit untuk anggota yang tetap ada', async () => {
    // Kegagalan terjadi DI COMMIT, setelah delete DAN penulisan audit selesai di
    // dalam transaksi. Kalau audit-nya lewat klien utama, barisnya sudah durable
    // pada titik ini dan TIDAK akan ikut hilang - tabel akan berisi "anggota
    // dicabut" untuk anggota yang sebenarnya masih ada, lebih buruk dari tidak
    // mencatat sama sekali.
    const state: FakeState = { members: ['caller', 'target'], role: 'STAFF' };
    const fake = makeMemberFake(state, true);
    const { audit, entries } = makeAuditStub();
    const service = new StoresService(fake.prisma, allowAccess(), audit);

    await expect(service.removeMember('caller', 'S', 'target')).rejects.toThrow('rollback');

    // Penulisannya memang terjadi...
    expect(entries).toHaveLength(1);
    // ...tapi tidak pernah sampai durable.
    expect(fake.isAuditCommitted()).toBe(false);

    // Dan keanggotaannya juga tidak berubah: rollback berarti tidak terjadi
    // apa-apa yang terlihat.
    expect(state.members).toContain('target');
  });
});

// ---------------------------------------------------------------------------
// Deadlock: kegagalan audit tidak boleh membatalkan perubahan secara senyap
// ---------------------------------------------------------------------------

describe('kegagalan audit di dalam lock membatalkan operasi, bukan menyenyapkan', () => {
  it('removeMember GAGAL saat INSERT audit memicu rollback seluruh transaksi', async () => {
    // Ini kelas kegagalan yang berbahaya: InnoDB me-rollback SELURUH transaksi
    // pada deadlock, `AuditService.record` menelan error-nya (R-23), lalu
    // Prisma mengirim COMMIT untuk transaksi yang sudah tidak ada.
    //
    // Kalau pemanggil tidak memeriksa hasil penulisan, hasilnya adalah 200
    // dengan keanggotaan yang sudah dihapus lalu dibatalkan - tanpa baris
    // audit, tanpa error. Kegagalan yang tidak bisa dideteksi DAN tidak bisa
    // dipulihkan: mencoba lagi akan ditolak `MEMBER_NOT_FOUND`.
    const state: FakeState = { members: ['caller', 'target'], role: 'STAFF' };
    const fake = makeMemberFake(state, { deadlockOnAudit: true });
    const { audit, entries } = makeAuditStub();
    const service = new StoresService(fake.prisma, allowAccess(), audit);

    // Permintaan harus gagal. Bukan "boleh gagal" - HARUS.
    await expect(service.removeMember('caller', 'S', 'target')).rejects.toThrow();

    // Dan tidak boleh ada baris audit yang bertahan, karena transaksinya
    // dibatalkan.
    expect(fake.isAuditCommitted()).toBe(false);
    // Penulisannya tetap dicoba; yang gagal adalah hasilnya, bukan pemanggilannya.
    expect(entries).toHaveLength(1);
  });

  it('updateMember GAGAL saat INSERT audit memicu rollback seluruh transaksi', async () => {
    const state: FakeState = { members: ['caller', 'target'], role: 'STAFF' };
    const fake = makeMemberFake(state, { deadlockOnAudit: true });
    const { audit } = makeAuditStub();
    const service = new StoresService(fake.prisma, allowAccess(), audit);

    await expect(
      service.updateMember('caller', 'S', 'target', { role: 'OWNER' }),
    ).rejects.toThrow();

    expect(fake.isAuditCommitted()).toBe(false);
  });

  it('operasi yang berhasil tetap 적용 dan tetap tercatat', async () => {
    // Positive control. Kalau test di atas lulus karena SEMUA operasi gagal,
    // maka ia tidak membuktikan apa pun. Jalur sehat harus tetap hijau.
    const state: FakeState = { members: ['caller', 'target'], role: 'STAFF' };
    const fake = makeMemberFake(state);
    const { audit } = makeAuditStub();
    const service = new StoresService(fake.prisma, allowAccess(), audit);

    await service.removeMember('caller', 'S', 'target');

    expect(state.members).not.toContain('target');
    expect(fake.isAuditCommitted()).toBe(true);
  });

  it('with AuditService sungguhan: deadlock mengembalikan false, bukan melempar', async () => {
    // Memakai instance `AuditService` yang asli, bukan stub, supaya jalur yang
    // ditelusuri benar-benar jalur produksi: `record` menelan error dan
    // mengembalikan `false`.
    const state: FakeState = { members: ['caller', 'target'], role: 'STAFF' };
    const fake = makeMemberFake(state, { deadlockOnAudit: true });

    const audit = new AuditService(fake.prisma);
    const service = new StoresService(fake.prisma, allowAccess(), audit);

    await expect(service.removeMember('caller', 'S', 'target')).rejects.toThrow();

    // Dan kegagalannya TERLIHAT lewat penghitung, jadi rollback ini tidak
    // senyap bagi operator.
    expect(audit.failureCount).toBeGreaterThan(0);
  });
});