import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '../common/types/prisma-enums.js';
import { APP_CONFIG } from '../config/configuration.js';
import type { AppConfig } from '../config/configuration.js';

/** Bentuk `req.user` setelah JWT tervalidasi. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}

/** Isi access token yang dipakai `validate`. */
interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/**
 * Validasi access token dari header `Authorization: Bearer <token>`.
 *
 * `validate` dipanggil hanya setelah signature dan `exp` lolos, jadi di sini
 * yang perlu dilakukan adalah memetakan payload ke bentuk `req.user` yang
 * dipakai controller.
 *
 * Keberadaan user di database TIDAK dicek di sini: access token berumur 15
 * menit, dan satu query per request hanya untuk memverifikasi ulang yang sudah
 * diverifikasi saat login adalah biaya yang tidak sepadan. Endpoint yang butuh
 * data user terbaru (profil, ganti password) tetap query database langsung.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}