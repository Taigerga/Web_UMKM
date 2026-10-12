import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

/**
 * Modul admin platform.
 *
 * Tidak ada `@StoreAccess()` di sini, dan itu bukan kelalaian: yang di-domain
 * modul ini memang data lintas tenant (directory toko, manajemen akun), bukan
 * data bisnis satu toko. Akses ke data bisnis tetap lewat keanggotaan
 * `store_members` (R-18).
 *
 * Seluruh route di modul ini bertanda `@Roles('ADMIN')`, jadi `RolesGuard`
 * global yang menutupnya.
 *
 * `AuthModule` diimpor untuk `RefreshTokenService`: menonaktifkan akun ikut
 * mencabut seluruh refresh token miliknya, dan mengulangi query pencabutan di
 * sini berarti menulis aturan yang sama dua kali.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}