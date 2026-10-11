import { SetMetadata } from '@nestjs/common';
import { Role } from '../types/prisma-enums.js';

/** Key metadata yang menyimpan daftar peran platform yang diizinkan. */
export const ROLES_KEY = 'auth:roles';

/**
 * Membatasi route pada peran PLATFORM (`users.role`), bukan peran toko.
 *
 * Dipakai `RolesGuard` global. Route tanpa dekorator ini tidak dibatasi peran:
 * yang membatasinya adalah `@StoreAccess()` untuk data tenant.
 *
 * Berbeda dengan `@StoreAccess()`, dekorator ini menjawab pertanyaan "apa
 * Buffett Anda di dalam sistem", bukan "apa Anda punya toko ini". Keduanya
 * tidak saling menggantikan - `ADMIN` tetap butuh `@StoreAccess()` untuk
 * membaca data bisnis sebuah toko (R-18).
 *
 * ```ts
 * @Get()
 * @Roles('ADMIN')
 * listAll() {}
 * ```
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);