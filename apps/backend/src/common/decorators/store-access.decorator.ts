import { SetMetadata } from '@nestjs/common';
import { StoreMemberRole } from '../types/prisma-enums.js';

/** Key metadata yang menyimpan persyaratan akses toko. */
export const STORE_ACCESS_KEY = 'store:access';

/** Bentuk metadata `@StoreAccess()`. */
export interface StoreAccessRequirement {
  /**
   * Peran toko minimum. `null` berarti HANYA keanggotaan yang dicek, bukan
   * tingkat perannya - jadi apa pun yang dilakukan user terhadap tokonya
   * sendiri, termasuk membaca.
   */
  minimum: StoreMemberRole | null;
}

/**
 * Meminta guard global memverifikasi keanggotaan user pada `:storeId`.
 *
 * `StoreScopeGuard` membaca `storeId` dari PATH PARAM saja - tidak pernah dari
 * query string atau body - lalu memanggil `StoreAccessService.assertAccess`
 * dan menempelkan hasilnya ke `request.storeMembership`. Mainly supaya handler
 * tidak perlu query keanggotaan lagi.
 *
 * ```ts
 * @Get(':storeId')
 * @StoreAccess()            // cukup anggota
 * detail() {}
 *
 * @Patch(':storeId')
 * @StoreAccess('OWNER')     // harus OWNER
 * update() {}
 * ```
 *
 * Route tanpa dekorator ini TIDAK otomatis ter-scope: ia hanya butuh JWT.
 * Menulis `@StoreAccess()` adalah keputusan sadar, bukan default.
 */
export const StoreAccess = (
  minimum?: StoreMemberRole,
): MethodDecorator & ClassDecorator => SetMetadata(STORE_ACCESS_KEY, { minimum: minimum ?? null });