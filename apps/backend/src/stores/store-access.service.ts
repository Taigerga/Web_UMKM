import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { StoreMemberRole, StoreStatus } from '../common/types/prisma-enums.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { TenantModelName } from '../database/tenant-scope.extension.js';

/**
 * Pembaca yang bisa di-scope per tenant.
 *
 * `PrismaService` memenuhi bentuk ini apa adanya lewat `tenantModel`. Bentuk
 * ini ada supaya `StoreAccessService` bisa menerima SEBUAH sumber baca lain -
 * khusunya klien transaksi Prisma, yang tidak punya `tenantModel` sendiri -
 * tanpa menulis ulang aturan scoping-nya. Tanpa bentuk ini, kode yang berjalan
 * di dalam `$transaction` harus punya salinan `findMembership` sendiri, dan
 * kedua salinan itu akan berbeda begitu aturan scoping berubah.
 */
export interface TenantScopedReader {
  tenantModel<K extends TenantModelName>(model: K, storeId: string): PrismaClient[K];
}

/**
 * Satu toko beserta peran user di dalamnya.
 *
 * Dikembalikan `assertAccess` supaya handler tidak perlu query keanggotaan
 * kedua kali.
 */
export interface StoreMembership {
  storeId: string;
  userId: string;
  role: StoreMemberRole;
  joinedAt: Date;
}

/** Satu toko beserta peran user di dalamnya. */
export interface StoreSummary {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
  /** Peran user DI TOKO INI, bukan peran platform-nya. */
  role: StoreMemberRole;
}

/**
 * Perbandingan tingkat peran toko.
 *
 * Sengaja `OWNER: 2` di atas `STAFF: 1`: hanya dua tingkat, dan OWNER selalu
 * lebih tinggi. Tidak ada peran antara keduanya, jadi tabel ini cukup dan tidak
 * perlu jadi daftar panjang yang bisa keliru saat enum berubah.
 */
export type StoreRoleRank = { OWNER: 2; STAFF: 1 };

export const STORE_ROLE_RANK: StoreRoleRank = { OWNER: 2, STAFF: 1 };

/**
 * Apakah `role` setidaknya sebesar `minimum`?
 *
 * `minimum` opsional/undefined berarti HANYA keanggotaan yang dicek, bukan
 * tingkatnya - jadi selalu `true` untuk peran yang dikenal.
 *
 * Peran di luar `StoreRoleRank` (mis. `ADMIN`, atau string dari data rusak)
 * menghasilkan `undefined` dari perbandingan dan karena itu dianggap TIDAK
 * cukup. Itu default-deny: peran yang tidak dikenal tidak boleh otomatis
 * mendapat akses.
 */
export function hasAtLeast(role: StoreMemberRole, minimum?: StoreMemberRole): boolean {
  if (minimum === undefined || minimum === null) return true;
  const actual = STORE_ROLE_RANK[role];
  const required = STORE_ROLE_RANK[minimum];
  return actual !== undefined && required !== undefined && actual >= required;
}

/**
 * Satu-satunya pintu masuk untuk keputusan "apakah user boleh menyentuh toko
 * ini".
 *
 * Semua controller, guard, dan service yang butuh data toko harus lewat sini.
 * Meny decentralkan pengecekan akan membuat kata "kecuali" makin banyak, dan
 * setiap kecuali adalah satu celah.
 */
@Injectable()
export class StoreAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pastikan `userId` boleh mengakses `storeId`, minimal dengan peran `minimum`.
   *
   * Urutan pemeriksaan itu sendiri adalah kontrak:
   * 1. **Keanggotaan** - tidak member berarti `STORE_FORBIDDEN`.
   * 2. **Status toko** - `SUSPENDED` berarti `STORE_SUSPENDED`.
   * 3. **Peran** - kurang dari `minimum` berarti `INSUFFICIENT_ROLE`.
   *
   * ## R-18: ADMIN tetap harus jadi member
   *
   * `ADMIN` managing platform: memodifikasi akun, melihat daftar toko, dll.
   * Data bisnis satu toko milik orang lain bukan haknya, dan member storefront
   * harus tetap bisa. Jadi peran platform TIDAK pernah menjadi jalan pintas di sini -
   * hanya baris `store_members` yang memenuhi, untuk semua peran termasuk
   * ADMIN. Kalau ini longgar, satu akun admin yang Bocor = seluruh data semua
   * UMKM, dan "least privilege" hanya jadi hiasan.
   *
   * Konsekuensinya: `ADMIN` yang juga anggota toko punya akses biasa sebagai
   * anggota, dan hanya bisa masuk ke `/admin/*` lewat `@Roles('ADMIN')`.
   *
   * ## Kenapa `tenantModel`
   *
   * Baris keanggotaan dibaca lewat
   * `tenantModel('storeMembers', storeId).findUnique(...)`, bukan delegate
   * mentah. Delegate ter-scope menolak pemanggilan yang `where.storeId`-nya tidak
   * disebut atau berbeda dari scope, jadi tidak ada jalur "baca membership
   * toko lain lalu pakai di sini".
   *
   * Catatan jujur soal batasnya: untuk query INI, `where` memakai compound key
   * `storeId_userId` yang isinya sudah memuat `storeId` dengan sendirinya, jadi
   * `tenantModel` di sini adalah penguat lapis kedua, bukan satu-satunya
   * penghalang. Test yang benar-benar membuktikan `tenantModel` mengubah hasil
   * ada di `GET /stores/:storeId/members` (lihat `test/idor.e2e.spec.ts`).
   *
   * @param userId user yang sedang melakukan request
   * @param storeId toko yang diakses; harus berasal dari PATH, bukan input client
   * @param minimum peran toko minimum; `undefined` = cukup jadi anggota
   * @throws AppError 403 `STORE_FORBIDDEN` / `STORE_SUSPENDED` / `INSUFFICIENT_ROLE`
   */
  async assertAccess(
    userId: string,
    storeId: string,
    minimum?: StoreMemberRole,
  ): Promise<StoreMembership> {
    const membership = await this.findMembership(userId, storeId);

    if (!membership) {
      throw AppError.forbidden(
        'Anda bukan anggota toko ini.',
        'STORE_FORBIDDEN',
      );
    }

    const store = await this.prisma.stores.findUnique({
      where: { id: storeId },
      select: { id: true, status: true },
    });

    if (!store) {
      throw AppError.notFound('Toko tidak ditemukan.', 'STORE_NOT_FOUND');
    }

    if (store.status === StoreStatus.SUSPENDED) {
      throw AppError.forbidden(
        'Toko ini sedang dinonaktifkan.',
        'STORE_SUSPENDED',
      );
    }

    if (!hasAtLeast(membership.role, minimum)) {
      throw AppError.forbidden(
        'Peran Anda di toko ini tidak cukup untuk aksi tersebut.',
        'INSUFFICIENT_ROLE',
      );
    }

    return membership;
  }

  /**
   * Semua toko yang boleh diakses user - HANYA toko dia menjadi anggota.
   *
   * Bentuknya membership-per-toko, sama seperti `AuthService.loadProfile`:
   * query penemuan kandidat `storeId` harus lewat `prisma.storeMembers` mentah
   * karena pada titik itu belum ada tenant aktif untuk di-scope. Yang tidak
   * dipercaya adalah daftar kandidat itu: setiap kandidat diverifikasi ulang
   * lewat delegate ter-scope sebelum masuk hasil.
   *
   * Yang TIDAK dikembalikan: toko milik orang lain yang mungkin `@Roles('ADMIN')`
   * boleh lihat. Daftar ini adalah daftar kerja user, bukan daftar admin.
   */
  async listAccessible(userId: string): Promise<StoreSummary[]> {
    const candidates = await this.prisma.storeMembers.findMany({
      where: { userId },
      select: { storeId: true },
      orderBy: { joinedAt: 'asc' },
    });

    const stores: StoreSummary[] = [];
    for (const { storeId } of candidates) {
      const membership = await this.findMembership(userId, storeId);
      if (!membership) continue;

      const store = await this.prisma.stores.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, city: true, timezone: true, status: true },
      });
      if (!store) continue;

      stores.push({ ...store, role: membership.role });
    }

    return stores;
  }

  /**
   * Apakah user adalah OWNER toko ini?
   *
   * Mengembalikan `boolean`, bukan melempar: pemanggilnya adalah pertanyaan
   * ("apakah owner terakhir?") bukan permintaan izin. `false` mencakup user
   * yang bukan anggota sama sekali.
   *
   * Sengaja TIDAK memakai `assertAccess`: yang di sini hanya fakta "owns",
   * bukan "boleh akses". Toko yang `SUSPENDED` tetap punya owner, dan
   * pertanyaan ini harus tetap bisa dijawab untuk memagari pengangkatan owner
   * baru (Task 5) tanpa membuka jalan baca ke data toko.
   *
   * ## `reader` opsional (R-21)
   *
   * Argumen ketiga membuat pembacaan ini bisa dijalankan DI DALAM `$transaction`
   * milik pemanggil, memakai scoping yang sama persis. Tanpa itu, aturan owner
   * terakhir harus deciding "apakah target owner" DI LUAR transaksi - dan
   * keputusan itu basi pada saat transaksi benar-benar berjalan: owner bisa
   * sudah diturunkan atau dicabut oleh operasi lain di meantime. Bentuk
   * `TenantScopedReader` membuat kedua jalur memakai kode yang sama, jadi tidak
   * ada definisi "owner" kedua yang bisa berbeda.
   */
  async isOwner(
    userId: string,
    storeId: string,
    reader: TenantScopedReader = this.prisma,
  ): Promise<boolean> {
    const membership = await this.findMembership(userId, storeId, reader);
    return membership?.role === StoreMemberRole.OWNER;
  }

  /**
   * Baris keanggotaan, atau `undefined`.
   *
   * Satu-satunya tempat yang membaca `store_members` di service ini, supaya
   * aturan scoping-nya hanya perlu benar di satu titik.
   */
  private async findMembership(
    userId: string,
    storeId: string,
    reader: TenantScopedReader = this.prisma,
  ): Promise<StoreMembership | undefined> {
    return (await reader
      .tenantModel('storeMembers', storeId)
      .findUnique({ where: { storeId_userId: { storeId, userId } } })) as
      | StoreMembership
      | undefined;
  }
}