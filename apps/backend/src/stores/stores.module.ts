import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { StoresController } from './stores.controller.js';
import { StoresService } from './stores.service.js';
import { StoreAccessService } from './store-access.service.js';
import { StoreScopeGuard } from './guards/store-scope.guard.js';

/**
 * Modul toko.
 *
 * `StoreAccessService` di-export supaya modul lain memakai satu pintu akses yang
 * sama, bukan menulis ulang aturan keanggotaan sendiri.
 *
 * `StoresService` di-export supaya modul berikutnya bisa memakai aturan yang
 * sudah diuji (terutama owner terakhir) tanpa menyalinnya.
 *
 * `StoreScopeGuard` sengaja TIDAK didaftarkan sebagai `APP_GUARD` di sini:
 * rantai guard global tidak peduli module mana yang mendeklarasikannya, dan
 * diinstansiasi lewat `AppModule` supaya urutannya (R-17) terlihat dalam satu
 * daftar.
 */
@Module({
  imports: [PrismaModule],
  controllers: [StoresController],
  providers: [StoresService, StoreAccessService, StoreScopeGuard],
  exports: [StoresService, StoreAccessService],
})
export class StoresModule {}