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
   * STATUS: belum ada consumer produksi. Task 2 belum punya service sama
   * sekali, jadi saat ini pemanggilnya hanya test integrasi. Wiring produksi
   * resmi dilakukan di **Task 3**, saat service autentikasi pertama memakai
   * helper ini. Jangan dianggap sudah selesai.
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
