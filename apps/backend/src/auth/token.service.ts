import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG } from '../config/configuration.js';
import type { AppConfig } from '../config/configuration.js';
import { durationToMs } from '../common/utils/duration.util.js';
import type { Role } from '../common/types/prisma-enums.js';

/** Bentuk TTL yang diterima `jsonwebtoken` (template literal, bukan `string`). */
export type JwtExpiresIn = `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

/** Payload yang diklaim di dalam access token. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

/**
 * Penerbit access token (JWT berumur pendek, 15 menit).
 *
 * Tanda tangan dan masa hidup diambil dari `AppConfig`, jadi `JwtModule` (yang
 * juga memakai nilai yang sama) dan kode ini tidak bisa berbeda pendapat soal
 * secret maupun TTL.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Claim access token untuk user.
   *
   * TTL tidak bisa diganti dari config per-request, jadi tidak ada jalur kode
   * yang bisa menerbitkan token yang lebih panjang dari yang disepakati.
   */
  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(
      { sub: payload.sub, email: payload.email, role: payload.role },
      {
        secret: this.config.jwtSecret,
        // `jsonwebtoken` menghendaki `expiresIn` bertipe template literal
        // (`${number}m`), sedangkan TTL datang dari env sebagai `string` biasa.
        // `durationToMs` sudah menolak format lain saat runtime (dipanggil
        // `accessTokenTtlMs` di route cookie), jadi ini bukan input bebas.
        expiresIn: this.config.accessTokenTtl as JwtExpiresIn,
      },
    );
  }

  /** Masa hidup access token dalam milidetik, untuk `Max-Age` cookie. */
  get accessTokenTtlMs(): number {
    return durationToMs(this.config.accessTokenTtl);
  }

  /** Masa hidup refresh token dalam milidetik, untuk `Max-Age` cookie. */
  get refreshTokenTtlMs(): number {
    return this.config.refreshTokenTtlDays * 86_400_000;
  }
}