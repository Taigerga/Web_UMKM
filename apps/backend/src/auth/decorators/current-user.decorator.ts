import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../jwt.strategy.js';

/**
 * `@CurrentUser()` menyuntikkan hasil `JwtStrategy.validate` ke handler.
 *
 * Sengaja mengembalikan objek `AuthenticatedUser` dan bukan payload JWT mentah:
 * bentuk yang dikontrak controller adalah yang sudah dipetakan, jadi handler
 * tidak perlu tahu nama claim JWT (`sub` vs `userId`).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);