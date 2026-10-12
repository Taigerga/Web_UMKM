import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app-error.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthProfile } from '../auth/auth.service.js';
import { PasswordService } from '../auth/password.service.js';
import { normalizeEmail } from '../auth/email.util.js';
import { RefreshTokenService } from '../auth/refresh-token.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/audit-actions.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';

/** Bentuk profil yang dikembalikan endpoint `/users/me`. */
export type UserProfile = AuthProfile;

/**
 * Manajemen profil diri: baca, ubah, ganti password.
 *
 * Semua operasi di sini menaikkan `userId` dari access token yang sudah
 * tervalidasi. Tidak ada endpoint yang menerima `userId` dari body atau
 * parameter - kalau ada, itu berarti user bisa mengedit profil orang lain.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Profil user beserta toko yang boleh diakses.
   *
   * Query profil DAN keanggotaan toko di `AuthService.loadProfile`, yang juga
   * memakai `prisma.tenantModel()` untuk setiap membership (R-2).
   */
  async getMe(userId: string): Promise<UserProfile> {
    return this.authService.loadProfile(userId);
  }

  /**
   * Ubah nama dan/atau email sendiri.
   *
   * Email yang sudah dipakai user lain ditolak dengan `EMAIL_TAK_TERSEDIA`
   * (409). Dicek lebih dulu di sini supaya pesannya menyebut field-nya dan tidak
   * bergantung pada detail driver database; balapan tetap ditangani filter
   * global untuk `P2002`.
   *
   * Email dinormalisasi lewat `normalizeEmail` yang sama dengan `AuthService`.
   * Kalau aturan ini ditulis ulang di sini, `Budi@Contoh.ID` bisa lolos
   * pengecekan di satu jalur dan tidak di jalur lain - persis drift yang
   * `email.util.ts` diekstrasi untuk cegah.
   */
  async updateMe(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const data: { name?: string; email?: string } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 2) {
        throw AppError.badRequest(
          'VALIDATION_ERROR',
          'Permintaan tidak valid.',
          ['name minimal 2 karakter'],
        );
      }
      data.name = name;
    }

    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email);
      const owner = await this.prisma.users.findUnique({
        where: { email },
        select: { id: true },
      });
      if (owner && owner.id !== userId) {
        throw AppError.conflict(
          'EMAIL_TAK_TERSEDIA',
          'Email tersebut sudah dipakai akun lain.',
        );
      }
      data.email = email;
    }

    if (Object.keys(data).length === 0) {
      // PATCH tanpa perubahan tidak harmful, tapi mengembalikan body yang
      // sama persis lebih jujur daripada diam-diam menulis ulang baris dan
      // menyentuh `updatedAt`.
      return this.getMe(userId);
    }

    await this.prisma.users.update({ where: { id: userId }, data });
    return this.getMe(userId);
  }

  /**
   * Ganti password sendiri.
   *
   * Urutannya penting:
   * 1. password LAMA diverifikasi dulu - tanpa ini, siapa pun yang punya
   *    token curian bisa mengunci owner dengan mengganti password-nya;
   * 2. password baru di-hash dan disimpan;
   * 3. SETIAP refresh token milik user dicabut, karena password lama tidak
   *    berlaku lagi. Kalau langkah ini dilewati, sesi di perangkat lain tetap
   *    hidup sampai tokennya kedaluwarsa 7 hari.
   *
   * Caller harus login ulang setelah memanggil ini.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw AppError.notFound('Pengguna tidak ditemukan.', 'USER_NOT_FOUND');
    }

    const currentMatches = await this.passwordService.verify(
      user.passwordHash,
      dto.currentPassword,
    );

    if (!currentMatches) {
      // 400, bukan 401: caller sudah terbukti terautentikasi (access token
      // valid), yang salah adalah data yang dikirim, bukan kelayakannya.
      throw AppError.badRequest(
        'PASSWORD_SALAH',
        'Password lama tidak cocok.',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.users.update({ where: { id: userId }, data: { passwordHash } });
    await this.refreshTokenService.revokeAllForUser(userId);

    // Audit TANPA meta, dan itu bukan kelalaian: allowlist
    // `auth.password_changed` sengaja kosong. Password lama, password baru,
    // dan hash-nya semuanya terlarang di sini - allowlist kosong membuat itu
    // ditegakkan oleh `AuditService`, bukan oleh call site ini yang sedang
    // ingat untuk tidak mengirimkannya.
    await this.audit.record({
      actorId: userId,
      action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
      entity: 'user',
      entityId: userId,
    });
  }
}
