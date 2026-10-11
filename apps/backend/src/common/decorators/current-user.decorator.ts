import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user.js';

/**
 * `@CurrentUser()` menyuntikkan hasil `JwtStrategy.validate` ke handler.
 *
 * Sengaja mengembalikan objek `AuthUser` dan bukan payload JWT mentah: bentuk
 * yang dikontrak controller adalah yang sudah dipetakan, jadi handler tidak
 * perlu tahu nama claim JWT (`sub` vs `userId`).
 *
 * Berpindah ke `common/decorators/` karena bentuknya bukan lagi urusan modul
 * autentikasi saja - `RolesGuard` juga memakainya. Re-export lama di
 * `src/auth/decorators/current-user.decorator.ts` tetap ada supaya import
 * yang sudah ada tidak patah.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);