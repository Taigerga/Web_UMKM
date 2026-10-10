import { AppError } from '../common/errors/app-error.js';

/**
 * Model Fase 1 yang **memang punya kolom `storeId`**.
 *
 * PENTING: daftar ini adalah daftar MODEL yang bisa di-scope tenant, bukan
 * daftar model yang "milik tenant". `stores` TIDAK ada di sini: primary key-nya
 * adalah `id` dan tidak punya kolom `storeId`, sehingga
 * `tenantModel('stores', storeId)` akan gagal saat runtime dengan
 * `PrismaClientValidationError`. Toko dikirim dari URL, bukan dicari lewat
 * scope tenant, jadi ia diakses lewat `prisma.stores` biasa.
 *
 * `auditLogs` juga tidak ada: kolom `storeId`-nya memang ada, tapi tanpa
 * foreign key dan harus tetap bisa dibaca lintas toko (audit platform) serta
 * tetap terbaca setelah toko dihapus.
 *
 * Setiap anggota daftar ini WAJIB punya kolom `storeId` pada modelnya. Hal itu
 * dijaga oleh test kompilasi di `tenant-scope.extension.spec.ts` yang memetakan
 * `TenantModelName` ke tipe baris hasil generate.
 *
 * Nama di sini adalah nama MODEL Prisma, sama persis dengan nama delegat di
 * `PrismaClient` (`prisma.storeMembers`). Nama tabel MySQL tetap snake_case
 * lewat `@@map` di `prisma/schema.prisma`.
 */
export const TENANT_MODELS = ['storeMembers', 'storeInvites'] as const;

/** Nama model yang boleh di-scope tenant. */
export type TenantModelName = (typeof TENANT_MODELS)[number];

/**
 * Operasi yang `where`-nya sebuah FILTER, jadi `where.storeId` disuntik.
 *
 * `findFirstOrThrow` masuk daftar ini karena `where`-nya filter biasa.
 * `aggregate` juga: tanpa `where.storeId` ia menjumlahkan SELURUH tenant.
 *
 * `updateMany` dan `updateManyAndReturn` ikut karena `where`-nya juga filter.
 * Keduanya sekaligus punya payload `data`, dan `data.storeId`-nya ikut dipaksa
 * oleh proxy.
 */
export const TENANT_SCOPED_OPERATIONS = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
] as const;

/**
 * Operasi yang `where`-nya UNIQUE-INPUT (`{ id }`, `{ storeId, userId }`),
 * bukan filter. `where` tidak bisa disuntik ke sana, jadi pemanggil WAJIB
 * menyebut `storeId` sendiri dan nilainya harus sama dengan scope.
 *
 * Persyaratan ini **ditegakkan**, bukan hanya didokumentasikan: proxy melempar
 * `AppError` bila `where.storeId` tidak ada atau tidak sama dengan scope.
 * (Tipe `WhereUniqueInput` Prisma memang menerima filter skalar selain field
 * unik, jadi `where: { id, storeId }` valid.)
 */
export const TENANT_UNIQUE_INPUT_OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
  'upsert',
] as const;

/**
 * Operasi yang menulis baris baru: `data.storeId`dipaksa sama dengan scope.
 * Nilai dari pemanggil diabaikan supaya tidak ada jalur menulis ke toko lain.
 */
export const TENANT_WRITE_OPERATIONS = [
  'create',
  'createMany',
  'createManyAndReturn',
] as const;

/** Operasi agregasi yang butuh perlakuan khusus: `where` + `by`. */
export const TENANT_GROUP_BY_OPERATIONS = ['groupBy'] as const;

/**
 * Raw query meltedakkan seluruh scoping: SQL-nya ditulis tangan dan `where`
 * dari Prisma tidak berlaku. Jadi selalu menolak.
 */
export const TENANT_DENIED_OPERATIONS = [
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
] as const;

const WHERE_INJECTED: ReadonlySet<string> = new Set<string>(TENANT_SCOPED_OPERATIONS);
const UNIQUE_INPUT: ReadonlySet<string> = new Set<string>(TENANT_UNIQUE_INPUT_OPERATIONS);
const WRITE: ReadonlySet<string> = new Set<string>(TENANT_WRITE_OPERATIONS);
const GROUP_BY: ReadonlySet<string> = new Set<string>(TENANT_GROUP_BY_OPERATIONS);
const DENIED: ReadonlySet<string> = new Set<string>(TENANT_DENIED_OPERATIONS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unsupported(operation: string, reason: string): AppError {
  return new AppError(
    'TENANT_OPERATION_UNSUPPORTED',
    500,
    `Operasi "${operation}" tidak diizinkan pada delegate yang ter-scope tenant: ${reason}`,
  );
}

/**
 * Menyisipkan `storeId` ke `by` groupBy supaya grup tidak bisa lintas tenant.
 *
 * Entri yang sudah berbentuk OBJEK dipertahankan utuh. `storeId` hanya
 * disisipkan ke dalam daftar entri string, karena mencampur string dengan
 * objek (`[{ role: ... }, 'storeId']`) ditolak Prisma dengan
 * `PrismaClientValidationError`.
 *
 * Kalau seluruh entri berupa objek, `storeId` ikut disisipkan dalam bentuk
 * objek supaya array tetap homogen.
 */
function withStoreIdInBy(by: unknown): unknown[] {
  const entries = by === undefined || by === null ? [] : Array.isArray(by) ? [...by] : [by];
  const alreadyScoped = entries.some(
    (entry) => entry === 'storeId' || (isPlainObject(entry) && 'storeId' in entry),
  );
  if (alreadyScoped) return entries;

  const hasStringEntry = entries.some((entry) => typeof entry === 'string');
  return hasStringEntry ? [...entries, 'storeId'] : [...entries, { storeId: 'asc' }];
}

/**
 * `data` untuk operasi tulis wajib bisa dipaksa `storeId`-nya.
 *
 * Berlaku untuk `create`/`createMany`/`createManyAndReturn` maupun untuk
 * `update`/`updateMany`/`updateManyAndReturn` dan cabang `create`/`update`
 * milik `upsert`: tanpa ini, `update.data.storeId` bisa memindahkan baris ke
 * toko lain meski `where`-nya sudah ter-scope.
 */
function withStoreIdInData(data: unknown, scope: string, operation: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => {
      if (!isPlainObject(row)) {
        throw unsupported(operation, 'tiap elemen `data` harus berupa objek.');
      }
      return { ...row, storeId: scope };
    });
  }
  if (!isPlainObject(data)) {
    throw unsupported(operation, '`data` harus berupa objek atau array objek.');
  }
  return { ...data, storeId: scope };
}

/** Memaksa `storeId` pada `data` bila operasi memang punya payload tulis. */
function withScopedWriteData(
  args: Record<string, unknown>,
  scope: string,
  operation: string,
): Record<string, unknown> {
  if (args['data'] === undefined) return args;
  return { ...args, data: withStoreIdInData(args['data'], scope, operation) };
}

function scopedWhere(
  args: Record<string, unknown>,
  scope: string,
): Record<string, unknown> {
  const callerWhere = isPlainObject(args['where']) ? args['where'] : {};
  // Scope SELALU menang atas nilai storeId dari pemanggil, supaya tidak ada
  // jalur baca yang bisa menembus ke tenant lain.
  return { ...callerWhere, storeId: scope };
}

/**
 * Mengumpulkan setiap `storeId` yang disebut pemanggil di unique-input `where`.
 *
 * Dua bentuk yang harus ditangani, karena keenam model punya bentuk berbeda:
 * - scalar      : `{ id: 'x', storeId: 'A' }` (mis. `storeInvites`, unik `id`)
 * - compound    : `{ storeId_userId: { storeId: 'A', userId: 'u' } }`
 *                 (mis. `storeMembers`, unik `@@id([storeId, userId])`)
 *
 * Keduanya dibaca apa adanya, tanpa menebak nama field unik.
 */
function extractCallerStoreIds(where: unknown): string[] {
  if (!isPlainObject(where)) return [];
  const found: string[] = [];
  const top = where['storeId'];
  if (typeof top === 'string') found.push(top);
  for (const value of Object.values(where)) {
    if (!isPlainObject(value)) continue;
    const nested = value['storeId'];
    if (typeof nested === 'string') found.push(nested);
  }
  return found;
}

/**
 * Untuk operasi unique-input: pemanggil wajib menyebut storeId-nya sendiri dan
 * nilainya harus sama dengan scope. Tidak bisa "diperbaiki" otomatis karena
 * `where` adalah unique-input, bukan filter.
 */
function assertCallerScope(
  args: Record<string, unknown>,
  scope: string,
  operation: string,
): void {
  const callerStoreIds = extractCallerStoreIds(args['where']);
  if (callerStoreIds.length === 0) {
    throw new AppError(
      'TENANT_SCOPE_REQUIRED',
      500,
      `Operasi "${operation}" memakai unique-input, jadi storeId tidak bisa disuntik. ` +
        `Sebutkan storeId tenant aktif secara eksplisit di where, baik sebagai ` +
        `where.storeId maupun di dalam kunci majemuknya.`,
    );
  }
  if (callerStoreIds.some((id) => id !== scope)) {
    throw AppError.forbidden(
      `Akses ditolak: tenant aktif tidak cocok dengan storeId pada operasi "${operation}".`,
      'TENANT_SCOPE_MISMATCH',
    );
  }
}

/**
 * Membungkus delegate Prisma sehingga seluruh operasi terikat ke satu tenant.
 *
 * Ruling desain (bukan `$extends` Prisma): fungsi eksplisit ini bisa dibaca,
 * bisa diuji sendiri, dan tidak melakukan query rewriting tersembunyi.
 *
 * ## Default-deny
 *
 * Delegate hasil fungsi ini **menolak operasi yang tidak dikenal**, bukan
 * meneruskannya. `\"${operation}\" yang tidak dikenali adalah bug program, bukan
 * default yang aman: dulu konsekuensinya `groupBy`/`aggregate` membaca seluruh
 * tenant dan `create` menulis ke toko yang dipilih pemanggil. Sekarang
 * ketiganya menolak.
 *
 * Perlakuan per operasi:
 * - filter (`findMany`, `findFirst`, `findFirstOrThrow`, `count`, `aggregate`,
 *   `updateMany`, `updateManyAndReturn`, `deleteMany`): `where.storeId` disuntik.
 * - `groupBy`: `where.storeId` disuntik **dan** `storeId` ditambahkan ke `by`,
 *   karena tanpa itu grup bisa menjangkau lebih dari satu tenant. Entri `by`
 *   berbentuk objek dipertahankan utuh; `storeId` hanya disisipkan ke entri
 *   string.
 * - SETIAP payload tulis dipaksa `storeId` ke scope: `create`, `createMany`,
 *   `createManyAndReturn`, `update.data`, `updateMany.data`,
 *   `updateManyAndReturn.data`, serta `upsert.create` **dan** `upsert.update`.
 * - unique-input (`findUnique`, `findUniqueOrThrow`, `update`, `delete`,
 *   `upsert`): `where.storeId` wajib disebut pemanggil dan harus sama dengan
 *   scope; kalau tidak, lempar.
 * - raw query (`$queryRaw*`, `$executeRaw*`): selalu ditolak.
 * - apa pun selain itu: ditolak, dengan nama operasi disebut di pesan error.
 *
 * Memindahkan baris antar tenant lewat `data.storeId` pun tidak mungkin:
 * `storeId` selalu ditimpa dengan nilai scope, bukan dipercaya ke pemanggil.
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

  // Cache per operasi supaya identitas fungsi stabil dan tidak membangun
  // closure baru setiap kali properti diakses.
  type ScopedCall = (args?: Record<string, unknown>) => unknown;
  const wrapped = new Map<string, ScopedCall>();

  return new Proxy(client, {
    get(target, property) {
      // Properti non-string (Symbol) bukan operasi query.
      if (typeof property !== 'string') {
        return Reflect.get(target, property, target);
      }
      const value = Reflect.get(target, property, target) as unknown;
      // Delegate hanya punya operasi berupa fungsi; properti data lain
      // (bukan operasi) diteruskan apa adanya.
      //
      // Properti yang TIDAK ADA sama sekali (operation typo, operasi delegate
      // baru di Prisma berikutnya, atau raw query yang hanya ada di level
      // PrismaClient) dikembalikan sebagai stub yang melempar. Tanpa ini
      // pemanggil hanya akan melihat "x is not a function" tanpa tahu bahwa
      // aturan scoping-nya yang bermasalah.
      if (typeof value !== 'function') {
        if (value === undefined) {
          return (): never => {
            throw unsupported(
              property,
              'delegate ini tidak punya operasi tersebut (atau hanya tersedia di ' +
                'level PrismaClient, yang tidak bisa di-scope tenant).',
            );
          };
        }
        return value;
      }

      const cached = wrapped.get(property);
      if (cached) return cached;

      const original = value as (args?: Record<string, unknown>) => unknown;

      const build = (): ScopedCall => {
        if (WHERE_INJECTED.has(property)) {
          return (args = {}) =>
            original.call(
              target,
              withScopedWriteData({ ...args, where: scopedWhere(args, scope) }, scope, property),
            );
        }

        if (GROUP_BY.has(property)) {
          return (args = {}) =>
            original.call(target, {
              ...args,
              where: scopedWhere(args, scope),
              // Tanpa storeId di `by`, groupBy tetap bisa mengelompokkan baris
              // lintas tenant ke dalam grup yang sama.
              by: withStoreIdInBy(args['by']),
            });
        }

        if (WRITE.has(property)) {
          return (args = {}) =>
            original.call(target, {
              ...args,
              data: withStoreIdInData(args['data'], scope, property),
            });
        }

        if (UNIQUE_INPUT.has(property)) {
          return (args = {}) => {
            assertCallerScope(args, scope, property);
            // `update` punya payload `data`, dan `upsert` punya dua payload
            // (`create` dan `update`). Semuanya dipaksa ke scope, kalau tidak
            // `data.storeId` bisa memindahkan baris ke toko lain.
            const next = withScopedWriteData(args, scope, property);
            if (property === 'upsert') {
              next['create'] = withStoreIdInData(args['create'], scope, property);
              next['update'] = withStoreIdInData(args['update'], scope, property);
            }
            return original.call(target, next);
          };
        }

        if (DENIED.has(property)) {
          return () => {
            throw unsupported(
              property,
              'raw query tidak bisa di-scope tenant. Gunakan operasi yang ' +
                'terdaftar, atau lewat repository yang sudah di-scope.',
            );
          };
        }

        return () => {
          throw unsupported(
            property,
            'tidak ada aturan scoping untuk operasi ini. Tambahkan ke ' +
              'tenant-scope.extension.ts hanya bila memang aman.',
          );
        };
      };

      const scoped = build();
      wrapped.set(property, scoped);
      return scoped;
    },
  });
}

/** Guard runtime untuk `TenantModelName`, dipakai `PrismaService.tenantModel`. */
export function isTenantModel(model: string): model is TenantModelName {
  return (TENANT_MODELS as readonly string[]).includes(model);
}
