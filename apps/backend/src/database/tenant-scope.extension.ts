import { AppError } from '../common/errors/app-error.js';

/**
 * Model Fase 1 yang memiliki kolom `storeId`.
 *
 * `auditLogs` sengaja TIDAK ada di daftar ini: kolom `storeId`-nya memang ada,
 * tapi tanpa foreign key, dan log audit harus tetap bisa dibaca lintas toko
 * (mis. oleh admin platform) serta tetap terbaca setelah toko dihapus.
 * Scoping `auditLogs` dilakukan per-param, bukan lewat helper ini.
 *
 * Nama di sini adalah nama MODEL Prisma, sama persis dengan nama delegate di
 * `PrismaClient` (`prisma.storeMembers`). Nama tabel MySQL tetap snake_case
 * lewat `@@map` di `prisma/schema.prisma`.
 */
export const TENANT_MODELS = ['stores', 'storeMembers', 'storeInvites'] as const;

/** Nama model yang boleh di-scope tenant. */
export type TenantModelName = (typeof TENANT_MODELS)[number];

/**
 * Operasi delegate yang disaring otomatis oleh {@link withTenantScope}.
 *
 * Daftar ini sengaja terbatas. `findUnique`/`update`/`delete` tidak bisa
 * disuntik dengan andal karena `where`-nya adalah unique-input, bukan filter;
 * pemanggil wajib menyebut `storeId` secara eksplisit pada operasi tersebut.
 */
export const TENANT_SCOPED_OPERATIONS = [
  'findMany',
  'findFirst',
  'count',
  'updateMany',
  'deleteMany',
] as const;

type ScopedOperation = (typeof TENANT_SCOPED_OPERATIONS)[number];

const SCOPED: ReadonlySet<string> = new Set<string>(TENANT_SCOPED_OPERATIONS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Membungkus delegate Prisma sehingga `where.storeId` selalu terisi dengan
 * `storeId` milik tenant yang sedang diakses.
 *
 * Ruling desain (bukan `$extends` Prisma): fungsi eksplisit ini bisa dibaca,
 * bisa diuji sendiri, dan tidak melakukan query rewriting tersembunyi. Isolasi
 * tenant bergantung pada setiap pemanggil yang memakai helper ini — itulah
 * alasan `withTenantScope` harus dipakai di setiap service yang menyentuh
 * `storeId`, bukan sekadar diekspor.
 *
 * `storeId` yang kosong melempar {@link AppError.forbidden} alih-alih
 * menghasilkan query tanpa filter, karena `where: {}` berarti "semua tenant".
 *
 * @param client delegate Prisma, mis. `prisma.storeMembers`
 * @param storeId tenant aktif; wajib non-kosong
 * @returns proxy dengan tipe yang sama dengan `client`
 */
export function withTenantScope<T extends object>(client: T, storeId: string): T {
  const scope = typeof storeId === 'string' ? storeId.trim() : '';
  if (scope.length === 0) {
    throw AppError.forbidden(
      'Akses ditolak: konteks tenant tidak tersedia.',
      'TENANT_CONTEXT_REQUIRED',
    );
  }

  // Proxy + cache per operasi supaya identitas fungsi stabil dan tidak
  // membangun closure baru setiap kali properti diakses.
  type ScopedCall = (args?: Record<string, unknown>) => unknown;
  const wrapped = new Map<string, ScopedCall>();

  return new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof property !== 'string' || !SCOPED.has(property)) return value;
      if (typeof value !== 'function') return value;

      const cached = wrapped.get(property);
      if (cached) return cached;

      const operation = property as ScopedOperation;
      const original = value as (args?: Record<string, unknown>) => unknown;
      const scoped = (args: Record<string, unknown> = {}): unknown => {
        const callerWhere = isPlainObject(args['where']) ? args['where'] : {};
        return original.call(target, {
          ...args,
          // Scope SELALU menang: nilai storeId dari pemanggil diabaikan agar
          // tidak ada jalur yang bisa membaca tenant lain.
          where: { ...callerWhere, storeId: scope },
        });
      };
      wrapped.set(operation, scoped);
      return scoped;
    },
  });
}