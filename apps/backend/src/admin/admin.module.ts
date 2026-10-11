import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { AdminController } from './admin.controller.js';

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
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
})
export class AdminModule {}