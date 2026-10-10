import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_CONFIG, loadConfig } from './configuration.js';
import type { AppConfig } from './configuration.js';

/**
 * Kunci env yang dibaca `loadConfig`, urut agar deterministik.
 *
 * Diekspor supaya `AppModule` dan `PrismaModule` bisa membangun `AppConfig`
 * dari sumber yang sama, tanpa menyalin daftar kunci.
 */
export const CONFIG_KEYS = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'JWT_SECRET',
  'ACCESS_TOKEN_TTL',
  'REFRESH_TOKEN_TTL_DAYS',
  'REFRESH_COOKIE_NAME',
  'ACCESS_COOKIE_NAME',
  'CORS_ORIGINS',
] as const;

/**
 * `loadConfig` melempar saat nilai wajib hilang atau `JWT_SECRET` terlalu
 * pendek, sehingga proses berhenti saat start, bukan saat request pertama.
 */
export const appConfigProvider: FactoryProvider<AppConfig> = {
  provide: APP_CONFIG,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const raw: Record<string, unknown> = {};
    for (const key of CONFIG_KEYS) {
      const value = configService.get<string>(key);
      if (value !== undefined) raw[key] = value;
    }
    return loadConfig(raw);
  },
};