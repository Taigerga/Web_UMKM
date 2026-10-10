import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { AppError } from '../common/errors/app-error.js';
import { CONFIG_KEYS } from '../config/app-config.provider.js';
import { loadConfig } from '../config/configuration.js';
import {
  TENANT_MODELS,
  withTenantScope,
  type TenantModelName,
} from './tenant-scope.extension.js';

/**
 * Instance Prisma Client tunggal untuk seluruh aplikasi.
 *
 * Prisma 7 tidak lagi membuat koneksi dari `schema.prisma`; client wajib
 * dikonstruksi dengan driver adapter. Di sini adapter-nya
 * `@prisma/adapter-mariadb`, dan connection string dibaca dari
 * `AppConfig.databaseUrl` — sumber yang sama dengan yang divalidasi
 * `loadConfig` saat start.
 *
 * Siklus hidup mengikuti module Nest: `$connect()` saat onModuleInit supaya
 * kegagalan koneksi Database muncul saat boot, bukan saat request pertama.
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
   * Ini titik masuk WAJIB untuk setiap query terhadap data tenant
   * (`stores`, `storeMembers`, `storeInvites`). Dipisah dari akses delegate
   * biasa supaya isolamento tenant punya satu pintu yang bisa di-review,
   * bukan sekadar sebuah helper yang diekspor lalu dipakai sesekali.
   *
   * ```ts
   * const members = await this.prisma.tenantModel('storeMembers', storeId).findMany({});
   * // otomatis jadi where: { storeId }
   * ```
   *
   * Model di luar {@link TENANT_MODELS} ditolak, bukan diteruskan.
   */
  tenantModel<K extends TenantModelName>(model: K, storeId: string): PrismaClient[K] {
    if (!(TENANT_MODELS as readonly string[]).includes(model)) {
      throw new AppError(
        'NOT_TENANT_MODEL',
        500,
        `Model "${model}" bukan model tenant. Perbarui TENANT_MODELS bila memang perlu.`,
      );
    }
    return withTenantScope(this[model], storeId) as PrismaClient[K];
  }
}