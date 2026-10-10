import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module.js';
import { AppConfigModule } from './config/config.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';

/**
 * Rate limit global default: 300 request / menit per IP.
 *
 * Endpoint auth TIDAK pakai nilai ini. `AuthController` memberi nama
 * throttler sendiri (`auth`) dengan batas jauh lebih ketat, dan karena
 * `ThrottlerGuard` Menjalankan SEMUA throttler yang terdaftar pada setiap
 * request, kedua batas sama-sama berlaku pada endpoint auth. Polanya
 * "ketat + longgar" itu disengaja: batas ketat menahan percobaan brute force,
 * batas default menjaga agar satu klien tidak bisa menguras Kuota global.
 */
export const DEFAULT_THROTTLE_OPTIONS = [
  { name: 'default', ttl: 60_000, limit: 300 },
];

/** Batas ketat untuk seluruh endpoint auth. */
export const AUTH_THROTTLE_OPTIONS = [
  { name: 'auth', ttl: 60_000, limit: 20 },
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ThrottlerModule.forRoot([...DEFAULT_THROTTLE_OPTIONS, ...AUTH_THROTTLE_OPTIONS]),
    AppConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
  ],
  providers: [
    // Tanpa provider ini, `@Throttle()` hanya metadata yang TIDAK dibaca
    // siapa pun: tidak ada guard yang memeriksa, jadi tidak ada rate limit
    // sama sekali. `ThrottlerGuard` harus jadi `APP_GUARD` supaya setiap
    // request melewati semua throttler yang terdaftar.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  // `APP_CONFIG` sekarang disediakan oleh `AppConfigModule` (global).
  // Modul ikut di-export supaya tokennya bisa diambil lewat `app.get()` dari
  // root module oleh `main.ts` dan `test/utils/test-app.ts`.
  exports: [AppConfigModule],
})
export class AppModule {}