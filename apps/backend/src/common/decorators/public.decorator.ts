import { SetMetadata } from '@nestjs/common';

/** Key metadata yang menandai route sebagai publik. */
export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Menandai route yang TIDAP butuh access token.
 *
 * Dipakai oleh `JwtAuthGuard`: guard global membaca metadata ini per handler
 * lalu per controller, dan melewati validasi JWT kalau ditemukan.
 *
 * Sengaja hanya menandai "publik", bukan "butuh guard": keputusan otorisasi
 * lain (peran, keanggotaan toko) milik `@Roles()`/`@StoreAccess()` di task
 * berikutnya.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);