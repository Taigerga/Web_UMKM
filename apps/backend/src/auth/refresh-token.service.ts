import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app-error.js';
import { APP_CONFIG } from '../config/configuration.js';
import type { AppConfig } from '../config/configuration.js';
import { PrismaService } from '../database/prisma.service.js';

/** Hasil issuance: token mentah (dikirim lewat cookie HttpOnly) + kedaluwarsa. */
export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/** Hasil rotasi: siapa pemiliknya, token baru, dan kapan kedaluwarsa. */
export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
}

/**
 * Grace window rotasi dalam milidetik (R-10). Nilainya 10 detik sesuai brief.
 */
export const REFRESH_ROTATION_GRACE_MS = 10_000;

/**
 * SHA-256 hex dari token mentah.
 *
 * Dipisah sebagai fungsi agar test bisa membuktikan kolom `tokenHash` berisi
 * digest, bukan token apa adanya.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Refresh token dengan rotasi dan deteksi penggunaan ulang.
 *
 * ## Yang disimpan
 *
 * Hanya SHA-256 dari token. Isi tabel `refresh_tokens` yang bocor tidak cukup
 * untuk dipakai: penyerang masih butuh token mentah, dan hash tidak bisa
 * di-reverse.
 *
 * ## Deteksi penggunaan ulang
 *
 * Setiap token punya `familyId` yang tetap sepanjang sesi login. Rotasi
 * menandai token lama dengan `revokedAt` dan `replacedById`. Kalau token yang
 * SUDAH dicabut muncul lagi, ada dua kemungkinan: dicuri, atau balapan dari
 * tab lain. Karena kita tidak bisa menebak yang mana, langkah paling aman
 * adalah mencabut seluruh `familyId` - semua sesi ikut mati, dan user harus
 * mati, dan user harus login ulang.
 *
 * ## Grace window (R-10)
 *
 * Aturan "token dicabut langsung berarti compromise" salah untuk kasus paling
 * umum di aplikasi web: dua tab melakukan refresh pada waktu yang hampir
 * sama. Tab A selesai rotasi, tab B menyusul beberapa milidetik kemudian
 * dengan token yang sama. Tanpa jeda, tab B salah dikira pencuri dan seluruh
 * keluarga ikut dicabut - user justru-KICKED dari aplikasi yang sedang DIPAKAI.
 *
 * Karena itu token yang dicabut kurang dari `REFRESH_ROTATION_GRACE_MS` yang
 * lalu DAN punya `replacedById` diperlakukan sebagai balapan benign: Issu
 * token baru di keluarga yang sama, TANPA menyentuh token yang sudah ada.
 *
 * "Tanpa menyentuh" itu inti dari grace window. Kalau token pengganti ikut
 * dicabut, tab yang sedang aktif kehilangan tokennya; pada refresh berikutnya
 * tab itu mengirim token yang sudah dicabut, dan barulah seluruh keluarga
 * tercabut - user tetap ter-logout, cuma beberapa request kemudian.
 *
 * Syarat `replacedById` penting, bukan hiasan. Token yang dicabut karena
 * logout atau ganti password tidak punya pengganti, jadi tidak pernah mendapat
 * pengecualian grace window - memakai token seperti itu tetap langsung ditolak.
 * Di luar jendela waktu, penggunaan ulang kembali dianggap compromise.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Terbitkan refresh token baru dengan keluarga sesi sendiri. */
  async issue(userId: string): Promise<IssuedRefreshToken> {
    return this.createToken(userId, randomUUID());
  }

  /**
   * Tukar refresh token dengan token baru dalam keluarga yang sama.
   *
   * Tiga jalur, urut dari yang paling biasa:
   * 1. token aktif            -> rotasi biasa
   * 2. token dicabut + dalam grace window + ada pengganti -> balangan benign
   * 3. selain itu            -> penggunaan ulang, seluruh keluarga dicabut
   */
  async rotate(presented: string): Promise<RotatedRefreshToken> {
    const record = await this.prisma.refreshTokens.findUnique({
      where: { tokenHash: hashRefreshToken(presented) },
    });

    if (!record) {
      throw AppError.unauthorized(
        'Refresh token tidak valid. Silakan masuk kembali.',
        'INVALID_REFRESH_TOKEN',
      );
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw AppError.unauthorized(
        'Refresh token sudah kedaluwarsa. Silakan masuk kembali.',
        'REFRESH_TOKEN_EXPIRED',
      );
    }

    if (record.revokedAt === null) {
      const rotated = await this.rotateFrom(record);
      return {
        userId: rotated.userId,
        token: rotated.token,
        expiresAt: rotated.expiresAt,
      };
    }

    const ageMs = Date.now() - record.revokedAt.getTime();
    const isBenignRace =
      record.replacedById !== null && ageMs < REFRESH_ROTATION_GRACE_MS;

    if (!isBenignRace) {
      await this.revokeFamily(record.familyId);
      throw AppError.unauthorized(
        'Refresh token tidak valid. Silakan masuk kembali.',
        'REFRESH_TOKEN_REUSED',
      );
    }

    // `isBenignRace` sudah menjamin `replacedById` bukan null. `!` di sini hanya
    // stating ulang invariant itu untuk TypeScript, bukan membuka bug baru.
    const successor = await this.prisma.refreshTokens.findUnique({
      where: { id: record.replacedById! },
    });

    // Secara teoretis cabang ini tidak terjangkau pada alur normal, karena
    // `replacedById` baru saja diisi dengan baris yang baru dibuat. Kalau
    // database memang dalam keadaan lain, gagal ke arah yang AMAN lebih baik
    // daripada menerbitkan token dari keluarga yang sudah dicabut.
    if (!successor || successor.revokedAt !== null) {
      await this.revokeFamily(record.familyId);
      throw AppError.unauthorized(
        'Refresh token tidak valid. Silakan masuk kembali.',
        'REFRESH_TOKEN_REUSED',
      );
    }

    // PENTING: token pengganti (milik tab lain) TIDAK dicabut di sini.

    // Kalau dicabut, kita hanya menukar-tab penalti: tab yang mengirim token
    // lama mendapat sesi baru, tapi tab yang sedang aktif kehilangan tokennya.
    // Di refresh berikutnya tab itu mengirim token yang sudah dicabut, lalu
    // seluruh keluarga ikut tercabut - user tetap ter-logout, cuma beberapa
    // request kemudian.
    //
    // Jadi balapan benign berarti: terbitkan token baru di keluarga yang
    // sama, tanpa menyentuh token siapa pun. Keluarga punya dua token hidup
    // selama balapan, dan itu memang harga yang dibayar untuk tidak
    // mengeluarkan user yang sedang memakai aplikasi.
    const issued = await this.createToken(successor.userId, successor.familyId);
    return {
      userId: successor.userId,
      token: issued.token,
      expiresAt: issued.expiresAt,
    };
  }

  /** Cabut seluruh token dalam satu keluarga sesi. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshTokens.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Cabut seluruh token milik satu user di semua keluarga.
   *
   * Dipakai saat password berubah: sesi lain ikut mati karena password lama
   * tidak berlaku lagi.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshTokens.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Cabut satu token saja (logout).
   *
   * Sengaja `updateMany` tanpa `findUnique` lebih dulu, dan token yang tidak
   * dikenal dianggap sukses: logout harus idempoten, dan mengembalikan 401
   * untuk "token ini tidak pernah ada" hanya memberi penyerang informasi
   * gratis tanpa manfaat apa pun.
   */
  async revokeToken(presented: string): Promise<void> {
    await this.prisma.refreshTokens.updateMany({
      where: { tokenHash: hashRefreshToken(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Rotasi dari satu record yang diketahui masih aktif.
   *
   * Token baru dibuat lebih dulu supaya `replacedById` selalu menunjuk baris
   * yang benar-benar ada. Kalau pembuatan gagal, token lama belum dicabut dan
   * user masih bisa mencoba lagi dengan token yang sama.
   */
  private async rotateFrom(record: {
    id: string;
    userId: string;
    familyId: string;
  }): Promise<RotatedRefreshToken> {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.refreshTokenTtlDays * 86_400_000,
    );

    const created = await this.prisma.refreshTokens.create({
      data: {
        userId: record.userId,
        tokenHash: hashRefreshToken(token),
        familyId: record.familyId,
        expiresAt,
      },
    });

    await this.prisma.refreshTokens.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: created.id },
    });

    return { userId: record.userId, token, expiresAt };
  }

  private async createToken(
    userId: string,
    familyId: string,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.refreshTokenTtlDays * 86_400_000,
    );
    await this.prisma.refreshTokens.create({
      data: { userId, tokenHash: hashRefreshToken(token), familyId, expiresAt },
    });
    return { token, expiresAt };
  }
}
