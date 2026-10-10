import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';

/**
 * Guard global yang mewajibkan access token valid.
 *
 * Menghormati `@Public()`: route bertanda itu dilewati begitu saja. Metadata
 * dibaca per handler dulu, baru per controller, supaya `@Public()` bisa
 * dipakai di level kelas maupun di satu method saja.
 *
 * Error dari `AuthGuard` (token hilang, kedaluwarsa, signature salah) berupa
 * `UnauthorizedException`, lalu dipetakan `AllExceptionsFilter` menjadi
 * `{ error: { code: 'UNAUTHORIZED', message: 'Autentikasi diperlukan.' } }`.
 * Detail kenapa token ditolak tidak ikut ke client.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: import('@nestjs/common').ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;
    return super.canActivate(context);
  }
}