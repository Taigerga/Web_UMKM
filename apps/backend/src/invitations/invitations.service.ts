import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app-error.js';
import { StoreStatus } from '../common/types/prisma-enums.js';
import type { StoreMemberRole as StoreMemberRoleType } from '../common/types/prisma-enums.js';
import { PrismaService } from '../database/prisma.service.js';
import { withTenantScope } from '../database/tenant-scope.extension.js';
import { normalizeEmail } from '../auth/email.util.js';
import { hashInviteToken } from './invite-token.util.js';
import { AuditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/audit-actions.js';

/**
 * Isi preview undangan yang boleh keluar ke client.
 *
 * Sengaja tidak memuat `id`, `storeId`, `tokenHash`, `acceptedAt`, atau
 * `invitedById`. Preview adalah halaman publik yang dibuka siapa pun yang
 * memegang token, jadi isinya dibuat seminimal mungkin: email tujuan, nama
 * toko, peran yang ditawarkan, dan kapan kedaluwarsa.
 */
export interface InvitationPreview {
  email: string;
  storeName: string;
  role: StoreMemberRoleType;
  expiresAt: string;
}

/**
 * Hasil menerima undangan: toko mana, dan peran yang DIMILIKI setelahnya.
 *
 * `role` di sini adalah peran yang benar-benar ada di `store_members` SESUDAH
 * operasi, bukan peran yang tertulis di undangan. Keduanya bisa berbeda: kalau
 * penerima sudah jadi anggota toko itu, undangan tidak menimpa peran yang sudah
 * dimiliki (lihat `accept`), sehingga jawabannya adalah peran lama.
 */
export interface AcceptedInvitation {
  storeId: string;
  storeName: string;
  role: StoreMemberRoleType;
}

/**
 * Alur undangan: lihat ringkasan, lalu terima.
 *
 * ## Dua pintu, dua tingkat autentikasi
 *
 * `preview` dipanggil `@Public()` di controller: penerima undangan belum tentu
 * punya akun, dan justru itulah gunanya halaman itu. `accept` selalu butuh JWT
 * karena keanggotaan hanya bisa dibuat untuk user yang sudah ada - tidak ada
 * jalur "terima undangan" yang membuat akun diam-diam.
 *
 * ## Toko dicari lewat token, bukan lewat tenant
 *
 * `storeInvites` adalah model tenant, jadi idealnya dibaca lewat
 * `tenantModel('storeInvites', storeId)`. Di sini `storeId` justru sedang
 * dicari: token menunjuk barisnya. Query penemuan itu -
 * `findUnique({ where: { tokenHash } })` pada delegate mentah - adalah satu-
 * satunya cara, persis seperti `AuthService.loadProfile` mencari kandidat
 * `storeId` sebelum punya tenant aktif.
 *
 * Yang tidak dipercaya adalah hasil penemuan itu. Begitu `storeId` diketahui,
 * setiap operasi berikutnya - membaca toko, membuat keanggotaan, menandai
 * undangan terpakai - sudah memakai `tenantModel` dengan tenant itu. Dan token
 * yang dicari adalah 256 bit acak: bukan kunci yang bisa dijelajahi, jadi
 * kebocoran daftar baris lewat sini tidak realistis.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lihat ringkasan undangan tanpa menerimanya.
   *
   * Urutan pemeriksaan menentukan apa yang boleh diceritakan ke pemanggil token
   * yang sudah tidak berlaku:
   * 1. token tidak dikenal -> `INVITE_NOT_FOUND` (404)
   * 2. sudah pernah diterima -> `INVITE_ALREADY_ACCEPTED` (409)
   * 3. kedaluwarsa -> `INVITE_EXPIRED` (400)
   * 4. toko dinonaktifkan -> `STORE_SUSPENDED` (403)
   *
   * Langkah 4 memakai pemeriksaan status yang sama dengan `assertAccess`, tapi
   * lewat `prisma.stores` biasa: pemanggil belum jadi anggota, jadi
   * `assertAccess` - yang butuh baris keanggotaan - tidak bisa dipakai di sini.
   * Yang dijaga tetap sama: toko suspended tidak boleh jadi pintu masuk baru.
   */
  async preview(token: string): Promise<InvitationPreview> {
    const invite = await this.findInviteByToken(token);
    this.assertUsable(invite);

    const store = await this.prisma.stores.findUnique({
      where: { id: invite.storeId },
      select: { name: true, status: true },
    });

    if (!store) {
      throw AppError.notFound('Toko tidak ditemukan.', 'STORE_NOT_FOUND');
    }

    if (store.status === StoreStatus.SUSPENDED) {
      throw AppError.forbidden('Toko ini sedang dinonaktifkan.', 'STORE_SUSPENDED');
    }

    // Audit `preview` dicatat tanpa meta: halaman ini dipanggil publik oleh
    // siapa pun yang memegang token, jadi yang dicatat hanya fakta bahwa
    // undangan itu pernah dilihat - bukan siapa yang melihatnya, dan bukan
    // email tujuannya. Keduanya akan menjadikan audit jadi kanal kebocoran
    // untuk data orang yang belum tentu memberikan persetujuannya.
    await this.audit.record({
      storeId: invite.storeId,
      action: AUDIT_ACTIONS.INVITATION_PREVIEWED,
      entity: 'invitation',
      entityId: invite.id,
    });

    return {
      email: invite.email,
      storeName: store.name,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  /**
   * Terima undangan: jadikan anggota toko dengan peran yang diundang.
   *
   * Urutan operasi, dan kenapa:
   *
   * 1. Validasi token (lihat `preview`).
   * 2. Email akun harus cocok dengan email undangan. Tanpa ini, siapa pun yang
   *    memegang token - termasuk orang yang meneruskannya - bisa masuk ke toko
   *    dengan akunnya sendiri. Menolak di sini juga membiarkan undangan tetap
   *    utuh untuk penerima yang sebenarnya.
   * 3. **Klaim dan pembuatan keanggotaan dalam SATU transaksi.**
   *
   *    Di dalamnya ada dua hal yang harus selalu terjadi bersama:
   *
   *    - **Klaim atomik** lewat `updateMany({ where: { acceptedAt: null } })`.
   *      Kalau jumlah baris yang terpengaruh 0, ada permintaan lain yang menang
   *      lebih dulu, dan pemanggil mendapat `INVITE_ALREADY_ACCEPTED` (RF-4)
   *      tanpa keanggotaan terbentuk. Aturan "cek dulu baru tulis" tidak bisa
   *      menahan dua permintaan yang tiba bersamaan; `UPDATE ... WHERE
   *      accepted_at IS NULL` bisa.
   *    - **Keanggotaan** dibuat dengan `upsert` yang TIDAK mengubah peran kalau
   *      sudah ada. Undangan adalah pintu masuk, bukan jalur ubah peran: kalau
   *      ia bisa menurunkan peran, aturan owner terakhir (R-21) punya bypass.
   *
   *    keduanya harus berada dalam satu `$transaction` yang sama. Tanpa itu,
   *    kegagalan pada `upsert` meninggalkan `acceptedAt` SUDAH ter-commit:
   *    undangan hangus permanen sementara penerima tidak memperoleh keanggotaan
   *    sama sekali, dan tidak ada jalan memulihkannya karena token sudah
   *    tercatat terpakai.
   *
   * 4. Jawaban memakai peran yang benar-benar DIMILIKI, dibaca dari baris
   *    membership yang dikembalikan `upsert` - bukan `invite.role`. Melaporkan
   *    peran yang diundang ketika database sudah menyimpan peran lain membuat
   *    frontend menyalakan kontrol OWNER yang akan ditolak backend.
   */
  async accept(token: string, userId: string): Promise<AcceptedInvitation> {
    const invite = await this.findInviteByToken(token);
    this.assertUsable(invite);

    const store = await this.prisma.stores.findUnique({
      where: { id: invite.storeId },
      select: { id: true, name: true, status: true },
    });

    if (!store) {
      throw AppError.notFound('Toko tidak ditemukan.', 'STORE_NOT_FOUND');
    }

    if (store.status === StoreStatus.SUSPENDED) {
      throw AppError.forbidden('Toko ini sedang dinonaktifkan.', 'STORE_SUSPENDED');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw AppError.notFound('Pengguna tidak ditemukan.', 'USER_NOT_FOUND');
    }

    if (normalizeEmail(user.email) !== invite.email) {
      throw AppError.forbidden(
        'Undangan ini ditujukan untuk email lain. Masuk memakai akun yang emailnya sama.',
        'INVITE_EMAIL_MISMATCH',
      );
    }

const membership = await this.prisma.$transaction(async (tx) => {
      // `tx` tidak punya `tenantModel`; aturan scoping-nya tetap milik
      // `withTenantScope` dan tidak ditulis ulang di sini.
      const invites = withTenantScope(tx.storeInvites, invite.storeId);
      const members = withTenantScope(tx.storeMembers, invite.storeId);

      // `acceptedAt: null` di `where` membuat undangan ini terpakai hanya
      // sekali, bahkan kalau dua permintaan datang bersamaan.
      const claimed = await invites.updateMany({
        where: { id: invite.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });

      if (claimed.count === 0) {
        throw AppError.conflict(
          'INVITE_ALREADY_ACCEPTED',
          'Undangan ini sudah pernah dipakai.',
        );
      }

      // `update: {}` sengaja kosong. Kalau keanggotaan sudah ada, peran yang
      // sudah dimiliki tidak ditimpa; lihat catatan langkah 3 di atas.
      //
      // `select: { role: true }` supaya jawaban di bawah memakai peran yang
      // benar-benar tersimpan, bukan peran yang diundang.
      return members.upsert({
        where: { storeId_userId: { storeId: invite.storeId, userId } },
        create: { storeId: invite.storeId, userId, role: invite.role },
        update: {},
        select: { role: true },
      });
    });

    // `role` yang dicatat adalah peran yang benar-benar DIMILIKI setelah
    // operasi, sama dengan yang dikembalikan ke pemanggil di bawah. Kalau
    // yang dicatat adalah `invite.role`, jejaknya akan berbeda dari kenyataan
    // pada kasus penerima yang sudah jadi anggota - persis kasus yang
    // membuat `upsert` dengan `update: {}` itu wajib.
    await this.audit.record({
      actorId: userId,
      storeId: store.id,
      action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
      entity: 'invitation',
      entityId: invite.id,
      meta: { role: membership.role },
    });

    return { storeId: store.id, storeName: store.name, role: membership.role };
  }

  /**
   * Cari baris undangan dari token mentah.
   *
   * `hashInviteToken` dihitung di sini persis seperti saat pembuatan, jadi tidak
   * ada jalur yang membandingkan token mentah dengan isi kolom.
   */
  private async findInviteByToken(token: string) {
    const invite = await this.prisma.storeInvites.findUnique({
      where: { tokenHash: hashInviteToken(token) },
    });

    if (!invite) {
      throw AppError.notFound('Undangan tidak ditemukan.', 'INVITE_NOT_FOUND');
    }

    return invite;
  }

  /**
   * Undangan hanya boleh dipakai sekali dan hanya sebelum kedaluwarsa (RF-4).
   *
   * Pemanggil sudah memegang barisnya, jadi pesan errornya jujur: kalau baris
   * tidak ada sama sekali, itu `findInviteByToken` yang tahu. Untuk token yang
   * dikenal, membocorkan bahwa undangan itu sudah dipakai hanya memberikan
   * informasi yang pemanggil sudah punya - dialah yang memakainya.
   */
  private assertUsable(invite: { acceptedAt: Date | null; expiresAt: Date }): void {
    if (invite.acceptedAt !== null) {
      throw AppError.conflict(
        'INVITE_ALREADY_ACCEPTED',
        'Undangan ini sudah pernah dipakai.',
      );
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      throw AppError.badRequest(
        'INVITE_EXPIRED',
        'Undangan ini sudah kedaluwarsa. Minta undangan baru ke pemilik toko.',
      );
    }
  }
}