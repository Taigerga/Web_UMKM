import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { AppError } from '../common/errors/app-error.js';
import { CONFIG_KEYS } from '../config/app-config.provider.js';
import { loadConfig } from '../config/configuration.js';
import {
  isTenantModel,
  withTenantScope,
  type TenantModelName,
} from './tenant-scope.extension.js';

/**
 * Instance Prisma Client tunggal untuk seluruh aplikasi.
 *
 * Prisma 7 tidak lagi membuat koneksi dari `schema.prisma`; client wajib
 * dikonstruksi dengan driver adapter. Di sini adapter-nya
 * `@prisma/adapter-mariadb`, dan connection string dibaca dari
 * `AppConfig.databaseUrl` - sumber yang sama dengan yang divalidasi
 * `loadConfig` saat start.
 *
 * Siklus hidup mengikuti module Nest: `$connect()` saat onModuleInit supaya
 * kegagalan koneksi database muncul saat boot, bukan saat request pertama.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const raw: Record<string, unknown> = {};
    for (const key of CONFIG_KEYS) {
      const value = configService.get<string>(key);
      if (value !== undefined) raw[key] = value;
    }
    const config = loadConfig(raw);
    // Connection string dipakai apa adanya. `PrismaMariaDb` menerimanya langsung
    // dan membuat pool-nya sendiri. Parameter `connection_limit` di URL TIDAK
    // mengatur pool Prisma 7, jadi tuning pool nanti harus lewat objek
    // `mariadb.PoolConfig`, bukan string URL.
    super({
      adapter: new PrismaMariaDb(config.databaseUrl),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Delegate Prisma yang terkunci ke satu tenant.
   *
   * Ini titik masuk WAJIB untuk setiap query terhadap data tenant, yaitu model
   * yang terdaftar di `TENANT_MODELS`: `storeMembers` dan `storeInvites`.
   * Delegate yang dikembalikan bersifat **default-deny**: operasi yang tidak
   * dikenal ditolak, `create` memaksa `data.storeId`, dan `aggregate`/`groupBy`
   * benar-benar ter-scope. `stores` TIDAK termasuk di sini karena tidak punya
   * kolom `storeId`; toko diakses lewat `prisma.stores` biasa.
   *
   * ```ts
   * const members = await this.prisma.tenantModel('storeMembers', storeId).findMany({});
   * // otomatis jadi where: { storeId }
   * ```
   *
   * STATUS: punya consumer produksi sejak **Task 3**. Pemanggil pertamanya
   * `AuthService.loadProfile` (`src/auth/auth.service.ts`), yang memverifikasi
   * keanggotaan tiap user per toko lewat helper ini, bukan lewat
   * `prisma.storeMembers` mentah.
   *
   * CATATAN jujur soal bukti: belum ada test e2e yang membuktikan
   * `tenantModel` menghasilkan luaran BERBEDA dari delegate mentah di jalur
   * itu. Query penemuan di `loadProfile` sudah memfilter `where: { userId }`
   * lebih dulu, jadi membership milik user lain memang tidak akan muncul
   * walau `tenantModel` dihapus. Yang terbukti saat ini adalah enforcement
   * proxy itu sendiri (test di `test/database.e2e.spec.ts`), bukan perbedaan
   * hasilnya. Detailnya ada di laporan Task 3.
   *
   * Model di luar `TENANT_MODELS` ditolak, bukan diteruskan.
   */
  tenantModel<K extends TenantModelName>(model: K, storeId: string): PrismaClient[K] {
    if (!isTenantModel(model)) {
      throw new AppError(
        'NOT_TENANT_MODEL',
        500,
        `Model "${String(model)}" bukan model tenant. Perbarui TENANT_MODELS bila memang perlu.`,
      );
    }
    return withTenantScope(this[model], storeId) as PrismaClient[K];
  }
}
