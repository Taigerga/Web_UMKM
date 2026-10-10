import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from './configuration.js';
import { appConfigProvider } from './app-config.provider.js';

/**
 * Sumber tunggal `AppConfig` untuk SELURUH aplikasi.
 *
 * `@Global()` disengaja: sebelumnya `APP_CONFIG` hanya dibuat di `AppModule`,
 * jadi modul yang diimpor `AppModule` (mis. `AuthModule`) tidak bisa
 * menyuntikkannya - modul hanya bisa melihat provider yang diimpornya sendiri
 * atau milik modul global. Memindahkannya ke modul global membuat satu
 * instance yang bisa dipakai JwtModule, controller cookie, dan service token
 * tanpa mengulang pembacaan env di tiap tempat.
 *
 * `AppModule` tetap meng-export `APP_CONFIG` supaya
 * `app.get<AppConfig>(APP_CONFIG)` di `main.ts` dan helper test tetap bekerja.
 */
@Global()
@Module({
  providers: [appConfigProvider],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}