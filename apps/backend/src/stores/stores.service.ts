import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app-error.js';
import { StoreMemberRole } from '../common/types/prisma-enums.js';
import type { StoreStatus } from '../common/types/prisma-enums.js';
import { PrismaService } from '../database/prisma.service.js';
import { normalizeEmail } from '../auth/email.util.js';
import { StoreAccessService } from './store-access.service.js';
import type { StoreMembership, StoreSummary } from './store-access.service.js';
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

  /** Ubah nama/kota. OWNER toko itu saja. */
  async update(userId: string, storeId: string, dto: UpdateStoreDto): Promise<StoreView> {
    await this.storeAccess.assertAccess(userId, storeId, StoreMemberRole.OWNER);

    const store = await this.prisma.stores.update({
      where: { id: storeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
      },
      select: { id: true, name: true, city: true, timezone: true, status: true },
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
   * ## R-21: owner terakhir
   *
   * Menurunkan owner terakhir ke `STAFF` ditolak dengan `LAST_OWNER` (409),
   * persis seperti mencabut keanggotaannya. Hasil kedua operasi itu sama saja:
   * toko tanpa owner, tidak bisa dikelola siapa pun, dan tidak ada jalan pulih
   * dari UI. Aturan ini memanggil `StoreAccessService.isOwner` - bukan menghitung
   * ulang perannya sendiri - supaya definisi "owner" hanya punya satu sumber.
   *
   * Menaikkan STAFF menjadi OWNER tetap boleh: itu menambah owner, bukan
   * mengurangi.
   */
  async updateMember(
    userId: string,
    storeId: string,
    targetUserId: string,
    dto: UpdateMemberDto,
  ): Promise<{ userId: string; role: StoreMemberRole }> {
    await this.storeAccess.assertAccess(userId, storeId, StoreMemberRole.OWNER);

    await this.requireMembership(storeId, targetUserId);

    // "Apakah target adalah owner?" dijawab lewat `StoreAccessService.isOwner`,
    // bukan dibaca dari baris yang sudah dibaca di atas. Pertanyaannya sama,
    // tapi lewat satu pintu: kalau nanti definisi "owner" berubah di
    // `store-access.service.ts`, aturan ini ikut berubah tanpa perlu disentuh.
    const targetIsOwner = await this.storeAccess.isOwner(targetUserId, storeId);

    // Hanya operasi yang benar-benar MENGAMBIL peran owner yang perlu
    // diperiksa. `OWNER -> OWNER` tidak mengurangi jumlah owner.
    if (targetIsOwner && dto.role !== StoreMemberRole.OWNER) {
      await this.assertAnotherOwnerExists(storeId);
    }

    const updated = await this.prisma
      .tenantModel('storeMembers', storeId)
      .update({
        where: { storeId_userId: { storeId, userId: targetUserId } },
        data: { role: dto.role },
        select: { userId: true, role: true },
      });

    return updated;
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
   */
  async removeMember(userId: string, storeId: string, targetUserId: string): Promise<void> {
    await this.storeAccess.assertAccess(userId, storeId, StoreMemberRole.OWNER);

    await this.requireMembership(storeId, targetUserId);

    // Sama seperti `updateMember`: lewat `isOwner`, bukan baca peran dari baris.
    if (await this.storeAccess.isOwner(targetUserId, storeId)) {
      await this.assertAnotherOwnerExists(storeId);
    }

    await this.prisma
      .tenantModel('storeMembers', storeId)
      .delete({ where: { storeId_userId: { storeId, userId: targetUserId } } });
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

  /** Keanggotaan `targetUserId` di `storeId`, atau 404. */
  private async requireMembership(
    storeId: string,
    targetUserId: string,
  ): Promise<StoreMembership> {
    const membership = await this.prisma
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
   * Pemanggil harus sudah memastikan target yang dimaksud adalah OWNER, lewat
   * `StoreAccessService.isOwner`. Perhitungan jumlah owner memakai
   * `tenantModel(...).count({ where: { role: OWNER } })`: tanpa tenant scope,
   * `count` itu akan menjumlah SELURUH owner di database dan aturan owner
   * terakhir tidak akan pernah menyala.
   */
  private async assertAnotherOwnerExists(storeId: string): Promise<void> {
    const ownerCount = await this.prisma
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