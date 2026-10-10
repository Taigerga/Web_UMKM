import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { AuthModule } from '../auth/auth.module.js';

/**
 * Modul profil diri.
 *
 * Mengimpor `AuthModule` untuk `PasswordService`, `RefreshTokenService`, dan
 * `AuthService` (yang dipakai ulang untuk `loadProfile`).
 *
 * `JwtAuthGuard` tidak di-import di sini: guard-nya global di `AuthModule`.
 * Menyebutkannya lagi di sini akan membuat instance kedua, dan yang kedua itu
 * yang akan dipakai modul ini.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}