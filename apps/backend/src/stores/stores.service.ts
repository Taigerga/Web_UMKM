import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app-error.js';
import { StoreMemberRole } from '../common/types/prisma-enums.js';
import type { StoreStatus } from '../common/types/prisma-enums.js';
import { PrismaService } from '../database/prisma.service.js';
import { withTenantScope } from '../database/tenant-scope.extension.js';
import type { TenantModelName } from '../database/tenant-scope.extension.js';
import { normalizeEmail } from '../auth/email.util.js';
import { StoreAccessService } from './store-access.service.js';
import type {
  StoreMembership,
  StoreSummary,
  TenantScopedReader,
} from './store-access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuditWriter } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/audit-actions.js';
import { lockStoreRow } from './store-owner-lock.js';
import { generateInviteToken, hashInviteToken } from '../invitations/invite-token.util.js';
import type { CreateStoreDto } from './dto/create-store.dto.js';
import type { CreateInvitationDto } from './dto/create-invitation.dto.js';
import type { UpdateMemberDto } from './dto/update-member.dto.js';
import type { UpdateStoreDto } from './dto/update-store.dto.js';

/** Bentuk toko yang boleh keluar ke client. */
export interface StoreView {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
}

/** Toko + peran PEMBUAT-nya, hanya untuk respons `POST /stores`. */
export interface CreatedStoreView extends StoreView {
  role: StoreMemberRole;
}

/** Bentuk anggota toko yang boleh keluar ke client. */
export interface StoreMemberView {
  userId: string;
  role: StoreMemberRole;
  joinedAt: string;
  user: { id: string; email: string; name: string; role: string };
}

/**
 * Undangan yang dibuat OWNER.
 *
 * `token` ADA di sini dan TIDAK ADA di tabel: ia diletakkan ke respons pembuatan
 * tepat satu kali (R-22). Bentuk lain yang menyebut undangan - `preview`,
 * `accept`, `members`, baris database - tidak pernah memuatnya, dan `tokenHash`
 * juga tidak, karena yang disimpan hanya digest.
 */
export interface IssuedInvitationView {
  id: string;
  email: string;
  role: StoreMemberRole;
  expiresAt: string;
  /** Token mentah. Hanya ada di respons pembuatan undangan. */
  token: string;
}

/**
 * Lama hidup undangan, dalam milidetik.
 *
 * 7 hari, sama dengan refresh token. Undangan adalah akses bertanda tangan ke
 * dalam satu toko, jadi tidak boleh hidup lebih lama dari kredensial lain di
 * sistem ini.
 */
export const INVITATION_TTL_MS = 7 * 86_400_000;

/**
 * Logika toko: buat, baca, ubah, kelola anggota, dan terbitkan undangan.
 *
 * ## Setiap operasi bertenant memanggil `assertAccess` sendiri
 *
 * Dekorator `@StoreAccess()` di controller adalah lapisan PERTAMA, bukan
 * lapisan satu-satunya. Setiap method di sini memanggil `StoreAccessService.
 * assertAccess` lagi sebelum menyentuh data, dan itu yang membuat
 * `assertAccess` default-deny untuk pemanggil lain: service ini bisa dipanggil
 * dari controller, dari task terjadwal, atau dari modul lain tanpa bergantung
 * bahwa `@StoreAccess` sudah terpasang.
 *
 * Konsekuensi yang diuji langsung (bukan lewat HTTP) ada di
 * `test/stores.e2e.spec.ts`, describe "toko SUSPENDED memblokir baca dan tulis
 * di layer service". Kalau pemeriksaan status hanya ada di guard, pemanggilan
 * langsung ke service itu akan lolos.
 *
 * ## `userId` selalu dari access token
 *
 * Tidak ada method di sini yang menerima `userId` dari body atau query string.
 * `targetUserId` pada operasi keanggotaan berasal dari PATH, dan hanya dipakai
 * untuk menunjuk BARIS yang dimodifikasi - hak aksesnya tetap dihitung dari
 * `userId` pemanggil.
 */
@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeAccess: StoreAccessService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Buat toko baru; pemanggil otomatis jadi OWNER di dalamnya.
   *
   * Dua baris, SATU transaksi. Ini bukan detail implementasi: kalau toko
   * terbentuk tanpa baris `store_members`-nya, hasilnya adalah toko yang tidak
   * bisa dikelola siapa pun - persis kondisi yang harus dihindari, dan dipulihkan
   * hanya lewat akses database langsung. Prisma menjalankan `$transaction`
   * dengan callback sebagai satu transaksi nyata, jadi kegagalan di langkah
   * kedua mengembalikan langkah pertama.
   *
   * `createdById` ditulis dari `userId` token, bukan dari body - lihat
   * `CreateStoreDto`.
   */
  async create(userId: string, dto: CreateStoreDto): Promise<CreatedStoreView> {
    const store = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stores.create({
        data: {
          name: dto.name.trim(),
          // Kunci `city` sengaja hanya ditulis kalau dikirim. Menulis
          // `city: undefined` memang tidak merusak query Prisma, tapi test transaksi
          // memeriksa bentuk payload yang benar-benar terkirim.
          ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
          createdById: userId,
        },
        select: { id: true, name: true, city: true, timezone: true, status: true },
      });

      await tx.storeMembers.create({
        data: { storeId: created.id, userId, role: StoreMemberRole.OWNER },
      });

      return created;
    });

    // Audit DI LUAR transaksi, setelah COMMIT. Menulisnya di dalam
    // `$transaction` berarti audit ikut di-rollback saat operasi bisnis
    // gagal, sehingga jejaknya hilang persis di saat yang paling perlu
    // ditelusuri. `AuditService.record` tidak melempar, jadi kegagalan audit
    // di sini tidak memengaruhi hasil yang dikembalikan ke pemanggil.
    await this.audit.record({
      actorId: userId,
      storeId: store.id,
      action: AUDIT_ACTIONS.STORE_CREATED,
      entity: 'store',
      entityId: store.id,
    });

    return { ...store, role: StoreMemberRole.OWNER };
  }

  /** Toko milik user: hanya toko dia menjadi anggota. */
  async list(userId: string): Promise<StoreSummary[]> {
    return this.storeAccess.listAccessible(userId);
  }

  /** Detail satu toko. `assertAccess` menolak non-anggota dan toko suspended. */
  async get(userId: string, storeId: string): Promise<StoreView> {
    await this.storeAccess.assertAccess(userId, storeId);
    return this.loadStore(storeId);
  }

  /**
   * Ubah nama/kota. OWNER toko itu saja.
   *
   * Audit mencatat NAMA kolom yang berubah, bukan nilai barunya. Itu pilihan
   * sadar: nilai nama kota adalah data bisnis tenant yang sudah ada di
   * `stores`, dan menyalinnya ke audit hanya menghasilkan salinan kedua yang
   * bisa berbeda dari sumbernya.
   */
  async update(userId: string, storeId: string, dto: UpdateStoreDto): Promise<StoreView> {
    await this.storeAccess.assertAccess(userId, storeId, StoreMemberRole.OWNER);

    const fields = (['name', 'city'] as const).filter((field) => dto[field] !== undefined);

    const store = await this.prisma.stores.update({
      where: { id: storeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
      },
      select: { id: true, name: true, city: true, timezone: true, status: true },
    });

    await this.audit.record({
      actorId: userId,
      storeId,
      action: AUDIT_ACTIONS.STORE_UPDATED,
      entity: 'store',
      entityId: storeId,
      meta: { fields },
    });

    return store;
  }

  /**
   * Daftar anggota toko.
   *
   * Barisnya dibaca lewat `tenantModel('storeMembers', storeId)`, bukan delegate
   * mentah: tanpa itu, `findMany({})` mengembalikan seluruh baris
   * `store_members` di database, termasuk anggota toko lain. `assertAccess`
   * hanya membuktikan pemanggil adalah anggota toko INI; ia tidak menyaring
   * baris mana yang dikembalikan.
   */
  async members(userId: string, storeId: string): Promise<StoreMemberView[]> {
    await this.storeAccess.assertAccess(userId, storeId);

    const rows = await this.prisma.tenantModel('storeMembers', storeId).findMany({
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });

    return rows.map((row) => ({
      userId: row.userId,
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
      user: row.user,
    }));
  }

/**
   * Ubah peran seorang anggota.
   *
   * OWNER toko itu saja boleh. `targetUserId` dari PATH, jadi tidak ada cara
   * menuliskan "ubah peran diriku sendiri" lewat body.
   *
   * ## R-21: owner terakhir, dan kenapa semuanya satu transaksi
   *
   * Menurunkan owner terakhir ke `STAFF` ditolak dengan `LAST_OWNER` (409),
   * persis seperti mencabut keanggotaannya: hasilnya sama saja, yaitu toko tanpa
   * owner, tidak bisa dikelola siapa pun, dan tidak punya jalan pulih dari UI.
   *
   * Yang menentukan bukan cuma hitungannya, tapi URUTAN dan SINKRONISASINYA.
   * Pemeriksaan "masih ada owner lain?" harus terjadi DI DALAM transaksi yang
   * sama dengan penulisannya, dan SETELAH lock baris induk diambil. Tanpa itu,
   * dua permintaan bersamaan pada toko dengan owner A dan B bisa keduanya
   * melihat "ada 2 owner", keduanya lolos, lalu salah satunya menghapus owner
   * terakhir. Penjelasan-mekanismenya di `withStoreOwnerLock` dan di
   * `store-owner-lock.ts`.
   *
   * Menaikkan STAFF menjadi OWNER juga melewati lock yang sama, supaya promosi
   * tidak bisa menyelundup melewati penjaga yang dibaca operasi lain.
   */
  async updateMember(
    userId: string,
    storeId: string,
    targetUserId: string,
    dto: UpdateMemberDto,
  ): Promise<{ userId: string; role: StoreMemberRole }> {
    // Otorisasi di luar transaksi: `assertAccess` hanya membaca dan tidak
    // mengubah apa pun, jadi tidak ada alasan memegangnya lebih lama dari perlu.
    await this.storeAccess.assertAccess(userId, storeId, StoreMemberRole.OWNER);

    return this.withStoreOwnerLock(storeId, async (reader, members) => {
      const membership = await this.requireMembership(reader, storeId, targetUserId);

      // "Apakah target adalah owner?" dijawab DI DALAM lock dan DI DALAM
      // transaksi, lewat `StoreAccessService.isOwner` dengan pembaca yang
      // sama. Satu definisi, pembacaan yang fresh.
      const targetIsOwner = await this.storeAccess.isOwner(targetUserId, storeId, reader);

      // Hanya operasi yang benar-benar MENGAMBIL peran owner yang perlu
      // diperiksa. `OWNER -> OWNER` tidak mengurangi jumlah owner.
      if (targetIsOwner && dto.role !== StoreMemberRole.OWNER) {
        await this.assertAnotherOwnerExists(reader, storeId);
      }

      const updated = await members.update({
        where: { storeId_userId: { storeId, userId: targetUserId } },
        data: { role: dto.role },
        select: { userId: true, role: true },
      });

      // Audit DI DALAM lock, bukan sesudahnya.
      //
      // Peran SEBELUM perubahan sudah ada di tangan (`membership.role`), jadi
      // tidak ada alasan menundanya sampai setelah commit. Dan menundanya
      // berbahaya di sini: `AuditService` tidak melempar (R-23), jadi kalau
      // penulisan audit gagal setelah transaksi selesai, peran lama DAN baris
      // audit sama-sama hilang - sementara aturan owner terakhir (R-21)
      // mengizinkan operasi ini terjadi tepat pada saat ada owner kedua. Tidak
      // ada yang bisa direkonstruksi sesudahnya.
      //
      // Di dalam transaksi, dua kemungkinan itu hilang: kalau commit, keduanya
      // durable; kalau rollback, keduanya hilang bersama dan tidak ada keadaan
      // setengah jadi yang menyesatkan.
      await this.audit.record(
        {
          actorId: userId,
          storeId,
          action: AUDIT_ACTIONS.STORE_MEMBER_ROLE_CHANGED,
          entity: 'store_member',
          entityId: targetUserId,
          meta: { from: membership.role, to: dto.role },
        },
        // Klien transaksi, supaya audit ikut commit/rollback yang sama. Tanpa
        // itu, "di dalam lock" hanya berlaku secara tata letak kode, sementara
        // penulisan tetap terjadi di koneksi terpisah.
        reader.tx as AuditWriter | undefined,
      );

      return updated;
    });
  }

  /**
   * Cabut keanggotaan seorang anggota.
   *
   * ## R-21: owner terakhir
   *
   * Mencabut owner terakhir ditolak dengan `LAST_OWNER` (409). Baris
   * `store_members` tidak boleh pernah kosong dari OWNER: tanpa owner, tidak ada
   * yang bisa mengunjuk owner baru, mengembalikan akses, atau memperbaiki
   * keadaan itu sendiri - karena semua operasi yang dibutuhkan untuk itu butuh
   * OWNER lebih dulu.
   *
   * Pemeriksaan dan penghapusannya berada dalam satu transaksi yang memegang
   * lock baris induk, bukan dua permintaan terpisah. Tanpa serialisasi,
   * "cek jumlah owner lalu hapus" bisa diloloskan dua kali bersamaan dan
   * menyisakan toko tanpa owner.
   */
  async removeMember(userId: string, storeId: string, targetUserId: string): Promise<void> {
    // Otorisasi di luar transaksi, dengan alasan yang sama seperti di
    // `updateMember`.
    await this.storeAccess.assertAccess(userId, storeId, StoreMemberRole.OWNER);

    await this.withStoreOwnerLock(storeId, async (reader, members) => {
      const membership = await this.requireMembership(reader, storeId, targetUserId);

      // Sama seperti `updateMember`: lewat `isOwner`, di dalam lock.
      if (await this.storeAccess.isOwner(targetUserId, storeId, reader)) {
        await this.assertAnotherOwnerExists(reader, storeId);
      }

      await members.delete({ where: { storeId_userId: { storeId, userId: targetUserId } } });

      // Audit DI DALAM lock - alasannya sama seperti di `updateMember`, dan di
      // sini lebih tajam lagi: begitu baris keanggotaan terhapus, sifatnya
      // hilang. Tidak ada yang bisa direkonstruksi; kalau penulisan audit gagal
      // setelah commit, "siapa mencabut siapa, atas otoritas OWNER siapa"
      // hilang permanen.
      //
      // Peran target dibaca dari `membership` yang sudah ada di tangan, bukan
      // sesudah delete - pada titik itu barisnya sudah tidak ada.
      await this.audit.record(
        {
          actorId: userId,
          storeId,
          action: AUDIT_ACTIONS.STORE_MEMBER_REMOVED,
          entity: 'store_member',
          entityId: targetUserId,
          meta: { role: membership.role },
        },
        reader.tx as AuditWriter | undefined,
      );
    });
  }

  /**
   * Terbitkan undangan untuk satu email.
   *
   * OWNER toko itu saja. Email dinormalisasi dengan `normalizeEmail` yang sama
   * dengan `AuthService`, supaya `PEGAWAI@Contoh.ID` dan `pegawai@contoh.id`
   * tidak jadi dua undangan berbeda - dan supaya pengecekan "email ini sudah
   * punya akun" di jalur terima selalu cocok dengan email yang tersimpan.
   *
   * ## R-22: token
   *
   * Token mentah dibuat di sini, dikembalikan ke pemanggil tepat satu kali, dan
   * TIDAK PERNAH disimpan. Yang masuk ke `tokenHash` hanya SHA-256-nya. Tidak
   * ada logging di jalur ini, dan `tokenHash` tidak ikut ke respons.
   */
  async invite(
    userId: string,
    storeId: string,
    dto: CreateInvitationDto,
  ): Promise<IssuedInvitationView> {
    await this.storeAccess.assertAccess(userId, storeId, StoreMemberRole.OWNER);

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const created = await this.prisma.tenantModel('storeInvites', storeId).create({
      data: {
        storeId,
        email: normalizeEmail(dto.email),
        tokenHash: hashInviteToken(token),
        role: dto.role,
        expiresAt,
        invitedById: userId,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    // `select` di atas sudah tidak menyertakan `tokenHash`; `token` ditambahkan
    // di sini dari variabel lokal, bukan dibaca dari baris yang disimpan.
    //
    // Yang TIDAK masuk audit: token mentah, `tokenHash`, dan email tujuan.
    // Dua yang pertama adalah kredensial; email adalah data pribadi orang yang
    // belum tentu sudah punya akun, dan `store_invites` tetap memuatnya
    // selama undangan hidup. Yang dicatat cukup peran yang ditawarkan.
    await this.audit.record({
      actorId: userId,
      storeId,
      action: AUDIT_ACTIONS.STORE_INVITATION_CREATED,
      entity: 'invitation',
      entityId: created.id,
      meta: { role: dto.role },
    });

    return {
      id: created.id,
      email: created.email,
      role: created.role,
      expiresAt: created.expiresAt.toISOString(),
      token,
    };
  }

/** Baris `stores` sebagai bentuk client, atau 404. */
  private async loadStore(storeId: string): Promise<StoreView> {
    const store = await this.prisma.stores.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, city: true, timezone: true, status: true },
    });
    // `assertAccess` sudah memastikan toko ada dan aktif, jadi `null` di sini
    // berarti keadaan tidak konsisten - dan 404 tidak membocorkan apa pun.
    if (!store) throw AppError.notFound('Toko tidak ditemukan.', 'STORE_NOT_FOUND');
    return store;
  }

  /**
   * Jalankan `fn` di dalam satu transaksi yang memegang lock baris induk toko.
   *
   * Ini SATU-SATUNYA pintu untuk operasi yang mengubah jumlah owner (R-21).
   * Urutannya disengaja dan tidak boleh diacak:
   *
   * 1. `SELECT ... FROM stores WHERE id = ? FOR UPDATE` - mengambil lock baris
   *    induk. Semua operasi owner-changing pada toko yang sama membloki baris
   *    yang sama, jadi mereka BERURUTAN, bukan paralel.
   * 2. `fn` berjalan: membaca keanggotaan target, menghitung owner, lalu
   *    menulis. Semua di bawah lock itu, jadi hitungan yang dilihat selalu
   *    sudah memuat hasil commit operasi owner-changing sebelumnya.
   * 3. Commit atau rollback.
   *
   * ## Kenapa lock pada baris induk, bukan baris keanggotaan
   *
   * Jumlah owner dihitung sebagai "lebih dari satu baris di sekumpulan baris".
   * Lock hanya satu baris keanggotaan tidak membuat pembacaan itu menjadi
   * atomic: dua operasi masih bisa mengunci dua baris yang BERBEDA, keduanya
   * membaca jumlah yang sama, lalu keduanya menulis. Yang membuat pembacaan
   * jumlah itu atomic adalah lock pada satu baris yang disepakati semua, dan
   * baris `stores` adalah satu-satunya kandidat yang memenuhi itu (lihat
   * `store-owner-lock.ts`).
   *
   * ## Aturan yang harus dipatuhi pemanggil berikutnya
   *
   * Serialisasi ini hanya berlaku selama SEMUA operasi yang bisa mengubah
   * jumlah owner melewati helper ini. Begitu ada satu operasi owner-changing
   * lain yang menulis `store_members` tanpa lock, penjaga ini jadi tidak
   * lengkap. Jangan tambahkan operasi owner-changing dengan
   * `prisma.tenantModel('storeMembers', ...).update/delete` langsung di luar
   * helper ini.
   *
   * ## Kenapa `assertAccess` TIDAK ikut di dalam transaksi
   *
   * Otorisasi hanya membaca, dan pemeriksaan itu tidak perlu serialisasi.
   * Memegangnya di dalam transaksi akan memperpanjang lock untuk setiap
   * permintaan yang ditolak. Pemanggil memanggilnya sebelum masuk ke sini.
   *
   * @param storeId toko yang di-lock; harus sudah lolos `assertAccess`
   * @param fn operasi yang berjalan di bawah lock
   */
  private async withStoreOwnerLock<T>(
    storeId: string,
    fn: (
      reader: TenantScopedReader,
      members: ReturnType<PrismaService['tenantModel']>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await lockStoreRow(tx, storeId);

      // Klien transaksi tidak punya `tenantModel`, jadi `TenantScopedReader`
      // dibungkus di sini. Aturan scoping-nya tetap milik
      // `withTenantScope`, bukan ditulis ulang.
      const reader: TenantScopedReader = {
        tenantModel: ((model: TenantModelName, scope: string) =>
          withTenantScope(
            (tx as unknown as Record<string, object>)[model],
            scope,
          )) as TenantScopedReader['tenantModel'],
        // Klien transaksinya ikut terekspos di sini, supaya operasi yang perlu
        // menulis DI DALAM transaksi yang sama (mis. baris audit keanggotaan)
        // benar-benar ikut commit/rollback. Tanpa ini, menulis lewat
        // `this.prisma` di dalam callback hanya terlihat "di dalam lock"
        // secara tata letak kode, padahal terjadi di koneksi terpisah.
        tx,
      };

      return fn(reader, reader.tenantModel('storeMembers', storeId));
    });
  }

  /** Keanggotaan `targetUserId` di `storeId`, atau 404. */
  private async requireMembership(
    reader: TenantScopedReader,
    storeId: string,
    targetUserId: string,
  ): Promise<StoreMembership> {
    const membership = await reader
      .tenantModel('storeMembers', storeId)
      .findUnique({ where: { storeId_userId: { storeId, userId: targetUserId } } });

    if (!membership) {
      throw AppError.notFound('Anggota toko ini tidak ditemukan.', 'MEMBER_NOT_FOUND');
    }

    return membership as StoreMembership;
  }

  /**
   * Tolak operasi yang akan membuat toko kehilangan owner terakhirnya (R-21).
   *
   * Selalu dipanggil dari dalam `withStoreOwnerLock`, jadi pembacaan jumlah
   * owner terjadi di bawah lock baris induk dan di dalam transaksi yang sama
   * dengan operasi yang memicunya.
   *
   * Dua hal yang menjaga helper ini benar:
   *
   * - `isOwner` di pemanggil sudah memakai pembaca yang sama, jadi
   *   keputusan "apakah target owner" dan keputusan "apakah masih ada owner
   *   lain" melihat keadaan yang sama.
   * - Hitungannya memakai `tenantModel(...).count({ where: { role: OWNER } })`.
   *   Tanpa tenant scope, `count` itu menjumlah SELURUH owner di database dan
   *   aturan owner terakhir tidak akan pernah menyala - dibuktikan oleh test
   *   "owner terakhir toko A tetap terkunci walau toko lain punya owner".
   */
  private async assertAnotherOwnerExists(
    reader: TenantScopedReader,
    storeId: string,
  ): Promise<void> {
    const ownerCount = await reader
      .tenantModel('storeMembers', storeId)
      .count({ where: { role: StoreMemberRole.OWNER } });

    if (ownerCount <= 1) {
      throw AppError.conflict(
        'LAST_OWNER',
        'Toko harus punya minimal satu OWNER. Jadikan anggota lain OWNER sebelum dicabut atau diturunkan.',
      );
    }
  }
}