import { describe, expect, it } from 'vitest';
import { InvitationsService } from './invitations.service.js';
import { generateInviteToken, hashInviteToken } from './invite-token.util.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';

/**
 * Klaim undangan dan pembuatan keanggotaan harus SATU transaksi.
 *
 * Dua statement terpisah punya konsekuensi fatal: kalau klaimnya sudah
 * ter-commit lalu `upsert`-nya gagal, undangan hangus permanen sementara
 * penerima tidak mendapat keanggotaan - dan karena `acceptedAt` sudah terisi,
 * tidak ada jalan memulihkannya lewat token yang sama.
 *
 * Test ini memakai Prisma PALSU yang memodelkan commit/rollback: statement yang
 * jalan di dalam `$transaction` menulis ke jurnal PENDING, dan jurnal itu hanya
 * dipindahkan ke state TERCOMMIT kalau callback selesai tanpa melempar. Dengan
 * begitu test bisa membedakan "dua statement dalam satu transaksi" dari
 * "dua transaksi terpisah".
 *
 * ## Apa yang dibuktikan dan apa yang TIDAK
 *
 * Dibuktikan: kedua statement dijalankan di dalam satu lingkup `$transaction`,
 * dan kegagalan pada statement kedua tidak meninggalkan klaim yang ter-commit.
 *
 * TIDAK dibuktikan: perilaku rollback MySQL itu sendiri - yang mengujanya adalah
 * fake ini, bukan database.
 */

interface CommittedState {
  invite: { acceptedAt: Date | null; email: string; role: string; expiresAt: Date };
  membership: { role: string } | null;
}

interface FakePrisma {
  prisma: PrismaService;
  /** Berapa kali `$transaction` benar-benar dipanggil. */
  txScopes: () => number;
}

function makeFakePrisma(state: CommittedState, failOn?: 'storeMembers'): FakePrisma {
  let txScopes = 0;

  // Delegasi di dalam `$transaction` menulis ke `pending`; delegasi di luar
  // menulis ke `state`. Forma kedua tidak dipakai pada jalur produksi di sini,
  // tapi kept supaya perbedaan keduanya terlihat kalau ada yang salah.
  const invitesDelegate = (target: CommittedState) => ({
    updateMany: (args: { where: { acceptedAt: Date | null }; data: { acceptedAt: Date } }) => {
      if (target.invite.acceptedAt !== args.where.acceptedAt) {
        return Promise.resolve({ count: 0 });
      }
      target.invite.acceptedAt = args.data.acceptedAt;
      return Promise.resolve({ count: 1 });
    },
  });

  const membersDelegate = (target: CommittedState) => ({
    upsert: (args: { create: { role: string } }) => {
      if (failOn === 'storeMembers') {
        throw new Error('keanggotaan gagal dibuat');
      }
      // `update: {}` - kalau keanggotaan sudah ada, peran lama bertahan.
      if (target.membership === null) {
        target.membership = { role: args.create.role };
      }
      return Promise.resolve({ role: target.membership.role });
    },
  });

  const root = {
    storeInvites: {
      findUnique: ({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(
          where.tokenHash === hashInviteToken(token)
            ? { ...state.invite, storeId: 'S1', id: 'I1' }
            : null,
        ),
      // Delegasi di luar transaksi. Ada supaya test bisa membedakan jalur
      // yang memakai `$transaction` dari jalur yang tidak: di sini tidak ada
      // rollback sama sekali, jadi kegagalan setelah klaim terlihat sebagai
      // klaim yang benar-benar ter-commit.
      updateMany: (args: {
        where: { acceptedAt: Date | null };
        data: { acceptedAt: Date };
      }) => {
        if (state.invite.acceptedAt !== args.where.acceptedAt) {
          return Promise.resolve({ count: 0 });
        }
        state.invite.acceptedAt = args.data.acceptedAt;
        return Promise.resolve({ count: 1 });
      },
    },
    storeMembers: {
      upsert: (args: { create: { role: string } }) => {
        if (failOn === 'storeMembers') {
          throw new Error('keanggotaan gagal dibuat');
        }
        if (state.membership === null) {
          state.membership = { role: args.create.role };
        }
        return Promise.resolve({ role: state.membership.role });
      },
    },
    stores: {
      findUnique: () =>
        Promise.resolve({ id: 'S1', name: 'Toko Uji', status: 'ACTIVE' }),
    },
    users: {
      findUnique: () => Promise.resolve({ id: 'U1', email: state.invite.email }),
    },
    $transaction: async (fn: (client: unknown) => Promise<unknown>) => {
      txScopes += 1;
      const pending: CommittedState = {
        invite: { ...state.invite },
        membership: state.membership === null ? null : { ...state.membership },
      };
      const result = await fn({
        storeInvites: invitesDelegate(pending),
        storeMembers: membersDelegate(pending),
      });
      // Callback selesai tanpa melempar -> commit. Melempar berarti rollback:
      // `state` tidak pernah tersentuh.
      state.invite.acceptedAt = pending.invite.acceptedAt;
      state.membership = pending.membership;
      return result;
    },
  };

  return { prisma: root as unknown as PrismaService, txScopes: () => txScopes };
}

const token = generateInviteToken();

/**
 * Stub `AuditService`.
 *
 * `accept` menulis audit setelah transaksinya selesai. Stub ini tidak sengaja
 * diuji di sini - yang diuji di file ini adalah batas transaksi. Audit-nya
 * diuji di `src/audit/audit.service.spec.ts` dan `test/audit.e2e.spec.ts`.
 */
const auditStub = { record: async () => {} } as unknown as AuditService;

function makeService(options: { failOn?: 'storeMembers'; membership?: { role: string } | null; inviteRole?: string } = {}) {
  const state: CommittedState = {
    invite: {
      acceptedAt: null,
      email: 'penerima@test.local',
      role: options.inviteRole ?? 'STAFF',
      expiresAt: new Date(Date.now() + 3_600_000),
    },
    membership: options.membership ?? null,
  };
  const fake = makeFakePrisma(state, options.failOn);
  return { service: new InvitationsService(fake.prisma, auditStub), state, fake };
}

describe('InvitationsService.accept: klaim dan keanggotaan satu transaksi', () => {
  it('berhasil: keanggotaan terbentuk dan undangan terpakai', async () => {
    const { service, state } = makeService();
    const result = await service.accept(token, 'U1');

    expect(result.role).toBe('STAFF');
    expect(state.membership).toEqual({ role: 'STAFF' });
    expect(state.invite.acceptedAt).not.toBeNull();
  });

  it('respons melaporkan peran yang DIMILIKI, bukan peran yang diundang', async () => {
    // Penerima sudah STAFF, undangan menawarkan OWNER. `upsert` memakai
    // `update: {}` jadi peran lama bertahan - dan itulah yang dikembalikan.
    const kept = makeService({ membership: { role: 'STAFF' }, inviteRole: 'OWNER' });
    const keptResult = await kept.service.accept(token, 'U1');
    expect(kept.state.membership).toEqual({ role: 'STAFF' });
    expect(keptResult.role).toBe('STAFF');

    // Positive control: tanpa keanggotaan sebelumnya, peran yang diundang yang
    // dipakai DAN dikembalikan.
    const fresh = makeService({ inviteRole: 'OWNER' });
    expect((await fresh.service.accept(token, 'U1')).role).toBe('OWNER');
  });

  it('kegagalan upsert TIDAK meninggalkan undangan terpakai', async () => {
    const { service, state } = makeService({ failOn: 'storeMembers' });

    await expect(service.accept(token, 'U1')).rejects.toThrow('keanggotaan gagal dibuat');

    // Inilah inti temuannya: tanpa `$transaction`, `acceptedAt` sudah commit
    // sebelum `upsert` gagal, dan undangan hilang selamanya.
    expect(state.invite.acceptedAt).toBeNull();
    expect(state.membership).toBeNull();
  });

  it('kedua statement berjalan di dalam satu lingkup $transaction', async () => {
    const { service, fake } = makeService();
    await service.accept(token, 'U1');
    expect(fake.txScopes()).toBe(1);
  });

  it('klaim yang kalah tidak membentuk keanggotaan', async () => {
    const { service, state } = makeService();
    // Undangan sudah terpakai oleh permintaan lain.
    state.invite.acceptedAt = new Date();

    await expect(service.accept(token, 'U1')).rejects.toMatchObject({
      status: 409,
      code: 'INVITE_ALREADY_ACCEPTED',
    });
    expect(state.membership).toBeNull();
  });
});