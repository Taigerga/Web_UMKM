import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  STORE_ACCESS_KEY,
  type StoreAccessRequirement,
} from '../../common/decorators/store-access.decorator.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { AppError } from '../../common/errors/app-error.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { StoreAccessService, type StoreMembership } from '../store-access.service.js';

interface RequestWithUser {
  user?: AuthUser;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
  storeMembership?: StoreMembership;
}

/**
 * Guard global ketiga (R-17), dipasang setelah `JwtAuthGuard` dan
 * `RolesGuard`.
 *
 * Menjalankan `StoreAccessService.assertAccess` untuk route bertanda
 * `@StoreAccess()` dan menempelkan hasilnya ke `request.storeMembership`.
 *
 * ## Tenant berasal dari ROUTE, tidak pernah dari klien
 *
 * `storeId` dibaca dari `request.params.storeId` - yaitu segment `:storeId`
 * pada path - dan dari TIDAK LAIN. Query string, body, dan header tidak pernah
 * dipertimbangkan. Ini bukan detail kecil: kalau guard memakai `query.storeId`,
 * seluruh IDOR suite ini bisa dilewati hanya dengan menambahkan
 * `?storeId=<toko orang lain>` pada request yang mestinya ditolak.
 *
 * Konsekuensi yang disengaja: `@StoreAccess()` hanya berguna di route yang
 * punya `:storeId` di path. Route tanpa segment itu harus ambil tenant dari
 * tempat lain secara eksplisit, dan tidak mendapat scoping gratis.
 *
 * ## Route tanpa `@StoreAccess()` tetap terbuka untuk user terautentikasi
 *
 * Guard ini tidak memaksa semua route punya `@StoreAccess()`; ia berlaku tepat
 * di route yang menandainya. Endpoint admin karena itu tidak butuh
 * `@StoreAccess()`, dan endpoint non-tenant (`/users/me`) tidak perlu apa-apa.
 *
 * ## Default-deny kalau tenant tidak bisa ditentukan
 *
 * `@StoreAccess()` di route tanpa `:storeId` adalah ketidaksesuaian antara
 * deklarasi dan bentuk route - dan kalau diteruskan, tenant bisa saja
 * teruskan ke `undefined`. Lebih aman menolak di sini dengan 403
 * `STORE_SCOPE_UNRESOLVED` daripada menjalankan query tanpa scope.
 */
@Injectable()
export class StoreScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly storeAccess: StoreAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<StoreAccessRequirement | undefined>(
      STORE_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw AppError.unauthorized();
    }

    const storeId = request.params?.storeId;
    if (typeof storeId !== 'string' || storeId.trim() === '') {
      throw AppError.forbidden(
        'Konteks toko tidak dapat ditentukan dari rute ini.',
        'STORE_SCOPE_UNRESOLVED',
      );
    }

    request.storeMembership = await this.storeAccess.assertAccess(
      user.userId,
      storeId,
      requirement.minimum ?? undefined,
    );

    return true;
  }
}