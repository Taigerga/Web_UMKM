import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthCookieService } from './auth-cookie.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import type { JwtExpiresIn } from './token.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { APP_CONFIG } from '../config/configuration.js';
import type { AppConfig } from '../config/configuration.js';

/**
 * Modul autentikasi.
 *
 * `JwtModule` dikonfigurasi dari `AppConfig` yang sama dengan `TokenService`, jadi
 * secret dan TTL tidak bisa berbeda antara penerbit dan pemeriksa token.
 *
 * `JwtAuthGuard` TIDAK lagi didaftarkan sebagai `APP_GUARD` di sini. Rantai
 * guard global (R-17: `JwtAuthGuard` → `RolesGuard` → `StoreScopeGuard`)
 * dideklarasikan seluruhnya di `AppModule`, karena urutan eksekusi APP_GUARD
 * mengikuti urutan provider - dan urutan itu tidak boleh bergantung pada
 * module mana yang kebetulan mendaftarkan dirinya lebih dulu.
 *
 * `PasswordService` dan `RefreshTokenService` di-export untuk
 * `UsersModule` (ganti password harus bisa memverifikasi password lama dan
 * mencabut seluruh sesi).
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
        // `TokenService` selalu mengoper `expiresIn` sendiri, jadi opsi ini
        // praktis tidak terpakai. Tapi JwtModule tetap dikonfigurasi lengkap
        // supaya tidak ada jalur tersembunyi yang menandatangani dengan TTL
        // default yang berbeda.
        signOptions: { expiresIn: config.accessTokenTtl as JwtExpiresIn },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookieService,
    PasswordService,
    TokenService,
    RefreshTokenService,
    JwtStrategy,
    // Tetap provider supaya bisa di-override di test; pendaftaran
    // `APP_GUARD`-nya pindah ke `AppModule`.
    JwtAuthGuard,
  ],
  exports: [PasswordService, RefreshTokenService, TokenService, AuthService],
})
export class AuthModule {}