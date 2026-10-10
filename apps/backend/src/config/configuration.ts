/**
 * Konfigurasi aplikasi (env schema + validasi).
 *
 * Semua import lokal wajib memakai ekstensi `.js` (ESM + moduleResolution nodenext).
 */

/** Nama cookie access token. */
export const ACCESS_COOKIE_NAME = 'bi_at';

/** Nama cookie refresh token (HttpOnly). */
export const REFRESH_COOKIE_NAME = 'bi_rt';

/** Panjang minimum JWT_SECRET. Pendek = tidak diam-diam dipakai, startup ditolak. */
export const JWT_SECRET_MIN_LENGTH = 32;

/** Origin default yang diizinkan oleh CORS. Tidak ada wildcard. */
export const DEFAULT_CORS_ORIGINS: readonly string[] = ['http://localhost:3000'];

/** DI token untuk `AppConfig`. */
export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtlDays: number;
  refreshCookieName: string;
  accessCookieName: string;
  corsOrigins: string[];
  isProduction: boolean;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function readString(
  raw: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = raw[key];
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return undefined;
  }
  const asString = String(value).trim();
  return asString.length > 0 ? asString : undefined;
}

function readNumber(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = readString(raw, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ConfigurationError(
      `Konfigurasi tidak valid: ${key} harus berupa angka, diterima "${value}".`,
    );
  }
  return parsed;
}

function readOrigins(raw: Record<string, unknown>): string[] {
  const value = readString(raw, 'CORS_ORIGINS');
  if (value === undefined) return [...DEFAULT_CORS_ORIGINS];
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (origins.length === 0) {
    throw new ConfigurationError(
      'Konfigurasi tidak valid: CORS_ORIGINS tidak boleh kosong.',
    );
  }
  for (const origin of origins) {
    if (origin === '*') {
      throw new ConfigurationError(
        'Konfigurasi tidak valid: CORS_ORIGINS tidak boleh memakai wildcard "*" bersama credentials.',
      );
    }
  }
  return origins;
}

/**
 * Membangun `AppConfig` dari raw environment. Melempar {@link ConfigurationError}
 * dengan pesan jelas bila variabel wajib hilang atau tidak valid.
 */
export function loadConfig(raw: Record<string, unknown>): AppConfig {
  const databaseUrl = readString(raw, 'DATABASE_URL');
  if (!databaseUrl) {
    throw new ConfigurationError(
      'Konfigurasi tidak valid: DATABASE_URL wajib diisi (contoh: mysql://root@127.0.0.1:3306/bisnis_insight_analytics_db).',
    );
  }

  const jwtSecret = readString(raw, 'JWT_SECRET');
  if (!jwtSecret) {
    throw new ConfigurationError(
      'Konfigurasi tidak valid: JWT_SECRET wajib diisi.',
    );
  }
  if (jwtSecret.length < JWT_SECRET_MIN_LENGTH) {
    throw new ConfigurationError(
      `Konfigurasi tidak valid: JWT_SECRET minimal ${JWT_SECRET_MIN_LENGTH} karakter (sekarang ${jwtSecret.length}).`,
    );
  }

  const nodeEnv = readString(raw, 'NODE_ENV') ?? 'development';

  return {
    nodeEnv,
    port: readNumber(raw, 'PORT', 3000),
    databaseUrl,
    jwtSecret,
    accessTokenTtl: readString(raw, 'ACCESS_TOKEN_TTL') ?? '15m',
    refreshTokenTtlDays: readNumber(raw, 'REFRESH_TOKEN_TTL_DAYS', 7),
    refreshCookieName:
      readString(raw, 'REFRESH_COOKIE_NAME') ?? REFRESH_COOKIE_NAME,
    accessCookieName: readString(raw, 'ACCESS_COOKIE_NAME') ?? ACCESS_COOKIE_NAME,
    corsOrigins: readOrigins(raw),
    isProduction: nodeEnv === 'production',
  };
}