import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { AppError } from '../errors/app-error.js';
import type { AuthUser } from '../types/auth-user.js';
import type { Role } from '../types/prisma-enums.js';

/**
 * Guard global kedua (R-17), dipasang setelah `JwtAuthGuard`.
 *
 * Menjawab satu pertanyaan saja: apakah peran PLATFORM user memenuhi
 * `@Roles(...)`? Keanggotaan toko bukan urusan guard ini - itu
 * `StoreScopeGuard` lewat `@StoreAccess()`.
 *
 * ## Default-lolos, bukan default-tolak
 *
 * Guard ini mengabaikan route tanpa `@Roles(...)`. Itu disengaja: bukan semua
 * route punya batas peran platform, dan memaksa setiap controller remembers
 * `@Roles()` adalah cara pasti lupa di salah satunya. Yang menutup route tanpa
 * `@Roles()` tetap `JwtAuthGuard`, dan yang menutup data tenant adalah
 * `StoreScopeGuard`. Menambah route tanpa `@Roles()` berarti "semua user
 * terautentikasi boleh", dan itu terlihat sebagai keputusan, bukan kelalaian.
 *
 * `@Public()` dilewati, konsisten dengan `JwtAuthGuard`, supaya dekorator itu
 * tetap berarti "tanpa syarat apa pun".
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    // Tanpa `req.user` berarti `JwtAuthGuard` tidak berjalan atau tidak
    // menghasilkan user. 401 lebih tepat daripada 403: pemanggil belum
    // terautentikasi sama sekali.
    if (!user) {
      throw AppError.unauthorized();
    }

    if (!required.includes(user.role)) {
      throw AppError.forbidden(
        'Peran Anda tidak punya akses ke sumber daya ini.',
        'FORBIDDEN_ROLE',
      );
    }

    return true;
  }
}