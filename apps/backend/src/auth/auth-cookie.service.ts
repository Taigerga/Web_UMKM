import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { APP_CONFIG } from '../config/configuration.js';
import type { AppConfig } from '../config/configuration.js';
import { TokenService } from './token.service.js';

/**
 * Path yang dipakai cookie refresh.
 *
 * Persempitan ini yang membuat cookie refresh tidak ikut terkirim ke setiap
 * request API dan tidak bisa dibaca JavaScript halaman mana pun: browser hanya
 * melampirkannya pada request di bawah prefix ini.
 */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Aturan cookie untuk kedua token.
 *
 * R-9 membagi tanggung jawabnya begini:
 *
 * - **Access token** ada di body DAN cookie. Cookie-nya sengaja TIDAK
 *   HttpOnly supaya middleware Next.js bisa membacanya dan tidak
 *   logout user tiap refresh halaman (spec 6.3 catatan arsitektur). Cookie-nya
 *   berumur pendek dan `Path=/` supaya middleware di mana pun bisa
 *   membacanya.
 * - **Refresh token** HANYA lewat cookie, HttpOnly, `SameSite=Lax`, dan
 *   `Path=/api/v1/auth`. Tidak pernah masuk body, jadi JavaScript tidak punya
 *   jalan membacanya walau XSS berhasil.
 *
 * Cookie access di-set ulang pada setiap login DAN setiap refresh, jadi tidak
 * ada keadaan di mana body dan cookie menyimpan token berbeda.
 *
 * `secure` mengikuti `NODE_ENV`: `false` di development/test agar cookie
 * tetap jalan di HTTP localhost, `true` di production.
 */
@Injectable()
export class AuthCookieService {
  constructor(
    private readonly tokenService: TokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Set cookie access (non-HttpOnly) dan refresh (HttpOnly). */
  setSessionCookies(
    response: Response,
    session: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
  ): void {
    response.cookie(this.config.accessCookieName, session.accessToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: this.config.isProduction,
      path: '/',
      maxAge: this.tokenService.accessTokenTtlMs,
    });

    response.cookie(this.config.refreshCookieName, session.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProduction,
      path: REFRESH_COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
  }

  /**
   * Hapus kedua cookie.
   *
   * Atribut `path` WAJIB sama persis dengan saat cookie di-set, termasuk
   * untuk access token yang `path`-nya `/`. Kalau tidak, browser menganggap
   * itu cookie berbeda dan membiarkannya utuh - logout akan terlihat berhasil
   * di server tapi token masih terkirim pada request berikutnya.
   */
  clearSessionCookies(response: Response): void {
    const options = {
      httpOnly: false,
      sameSite: 'lax' as const,
      secure: this.config.isProduction,
      path: '/',
    };
    response.clearCookie(this.config.accessCookieName, options);
    response.clearCookie(this.config.refreshCookieName, { ...options, path: REFRESH_COOKIE_PATH });
  }
}