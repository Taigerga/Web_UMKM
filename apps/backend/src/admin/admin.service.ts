import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/audit-actions.js';
import { RefreshTokenService } from '../auth/refresh-token.service.js';
import type { Role, StoreStatus } from '../common/types/prisma-enums.js';

/** Bentuk user pada daftar admin. */
export interface AdminUserView {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

/** Bentuk toko pada daftar admin. */
export interface AdminStoreView {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
  createdById: string;
  createdAt: string;
}

/**
 * Operasi admin platform.
 *
 * ## Kenapa `users` dan `stores` dibaca lewat delegate mentah
 *
 * Keduanya bukan model tenant, jadi tidak ada `tenantModel` yang bisa dipakai -
 * dan memang tidak boleh: justru inilah tujuan modul admin, membaca lintas
 * tenant. Yang membatasi adalah `@Roles('ADMIN')` di controller.
 *
 * `admin.users` tidak memberi akses ke data bisnis toko mana pun. Daftar ini
 * adalah directory platform; data UMKM milik orang hanya bisa dibaca kalau user
 * itu jadi anggota tokonya (R-18).
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /** Daftar seluruh user di platform. */
  async listUsers(
    actorId: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: AdminUserView[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.users.findMany({
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
      this.prisma.users.count(),
    ]);

    await this.audit.record({
      actorId,
      action: AUDIT_ACTIONS.ADMIN_USER_LISTED,
      entity: 'user',
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
    };
  }

  /** Daftar seluruh toko di platform. */
  async listStores(
    actorId: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: AdminStoreView[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.stores.findMany({
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stores.count(),
    ]);

    await this.audit.record({
      actorId,
      action: AUDIT_ACTIONS.ADMIN_STORE_LISTED,
      entity: 'store',
    });

    return {
      rows: rows.map((store) => ({
        id: store.id,
        name: store.name,
        city: store.city,
        timezone: store.timezone,
        status: store.status,
        createdById: store.createdById,
        createdAt: store.createdAt.toISOString(),
      })),
      total,
    };
  }

  /**
   * Aktifkan atau nonaktifkan sebuah akun.
   *
   * ## Kenapa refresh token ikut dicabut
   *
   * `AuthService.refresh` sudah memeriksa ulang `isActive`, jadi penolakan
   * terjadi pada refresh berikutnya. Tapi access token yang sudah terbit tetap
   * berlaku sampai 15 menit, dan selama jendela itu sesi yang seharusnya sudah
   * tutup masih hidup.
   *
   * Mencabut seluruh refresh token menutup sisi yang bisa ditutup sekarang.
   * Sisi access token tidak bisa ditutup tanpa daftar penolakan token - bukan
   * sesuatu yang bisa diselesaikan dengan menulis ulang `users.isActive`.
   *
   * ## Kenapa admin tidak boleh menonaktifkan diri sendiri
   *
   * Endpoint ini dijaga `@Roles('ADMIN')`, dan `ADMIN` hanya bisa dibuat lewat
   * seed (spec 6.3: registrasi selalu menghasilkan `OWNER`). Jadi admin yang
   * menonaktifkan dirinya sendiri tidak bisa mengaktifkan dirinya kembali lewat
   * API mana pun.
   */
  async setUserStatus(
    actorId: string,
    targetUserId: string,
    isActive: boolean,
  ): Promise<AdminUserView> {
    if (actorId === targetUserId && !isActive) {
      throw AppError.badRequest(
        'SELF_DEACTIVATION_NOT_ALLOWED',
        'Admin tidak bisa menonaktifkan akunnya sendiri.',
      );
    }

    const target = await this.prisma.users.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true },
    });

    if (!target) {
      throw AppError.notFound('Pengguna tidak ditemukan.', 'USER_NOT_FOUND');
    }

    // Update dan pencabutan refresh token SATU transaksi.
    //
    // Tanpa itu, `revokeAllForUser` yang gagal meninggalkan akun dalam keadaan
    // `isActive=false` dengan sesi yang masih hidup: akunnya terlihat dinonaktifkan
    // tapi orangnya masih bisa menukar refresh token-nya. Dan karena audit ditulis
    // setelahnya, kegagalan itu juga berarti TIDAK ADA baris yang mencatat admin
    // menonaktifkan siapa - perubahan akses yang tidak terlihat sama sekali.
    //
    // `tx` diteruskan ke `revokeAllForUser` agar keduanya ikut transaksi yang
    // sama. Tanpa itu, transaksi berjalan di koneksi lain dan hasilnya tidak
    // atomik sama sekali - jauh lebih buruk dari tidak ada transaksi.
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.users.update({
        where: { id: targetUserId },
        data: { isActive },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      if (!isActive) {
        await this.refreshTokens.revokeAllForUser(targetUserId, tx);
      }

      return row;
    });

    // Audit DI LUAR transaksi, setelah commit.
    //
    // Itu bukan sekadar karena R-23. Menulisnya di dalam berarti kegagalan
    // audit ikut me-rollback seluruh operasi bisnis: akun yang SUDAH
    // dinonaktifkan akan hidup kembali karena satu INSERT yang gagal. Untuk
    // operasi yang tidak bisa dibatalkan, lebih baik jejaknya hilang dan itu
    // terlihat lewat `AuditService.failureCount` daripada membatalkan efeknya.
    await this.audit.record({
      actorId,
      action: AUDIT_ACTIONS.ADMIN_USER_STATUS_CHANGED,
      entity: 'user',
      entityId: targetUserId,
      meta: { from: target.isActive, to: isActive },
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}
