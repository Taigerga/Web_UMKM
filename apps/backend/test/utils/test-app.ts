// WAJIB import pertama: menyetel process.env sebelum `app.module.js`
// mengevaluasi `ConfigModule.forRoot()` dan memuat `.env` lokal developer.
import './test-env.js';

import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import { InternalServerErrorException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import { IsEmail, IsInt, IsString, Min, MinLength } from 'class-validator';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap.js';
import { AppError } from '../../src/common/errors/app-error.js';
import { APP_CONFIG } from '../../src/config/configuration.js';
import type { AppConfig } from '../../src/config/configuration.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { Public } from '../../src/common/decorators/public.decorator.js';
import { StoreAccess } from '../../src/common/decorators/store-access.decorator.js';
import { Roles } from '../../src/common/decorators/roles.decorator.js';
import { CurrentUser } from '../../src/common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../src/common/types/auth-user.js';

/**
 * Route dummy KHUSUS TEST untuk memverifikasi ValidationPipe + global filter.
 * Sengaja tidak ada di `src/` — tidak boleh bocor ke aplikasi produksi.
 */
class EchoTestDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsEmail()
  email!: string;

  @IsInt()
  @Min(0)
  age!: number;
}

/**
 * Route yang memancing error Prisma sungguhan (GATE-T2-A).
 *
 * Body sengaja TIDAK memakai DTO: `ValidationPipe` tidak intervened saat
 * metatype bukan kelas, supaya test ini benar-benar menguji pemetaan error
 * dan bukan validasi input.
 */
@Controller('echo')
@Public()
class EchoTestController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('prisma-duplicate')
  async prismaDuplicate(@Body() body: { email: string }): Promise<{ id: string }> {
    const user = await this.prisma.users.create({
      data: { email: body.email, name: 'Dupe', passwordHash: 'x' },
    });
    return { id: user.id };
  }

  @Post('prisma-missing')
  async prismaMissing(@Body() body: { id: string }): Promise<{ name: string }> {
    const user = await this.prisma.users.update({
      where: { id: body.id },
      data: { name: 'Diperbarui' },
    });
    return { name: user.name };
  }

  @Post('prisma-fk')
  async prismaFk(@Body() body: { storeId: string; userId: string }): Promise<{ ok: true }> {
    // Delegate mentah, bukan `tenantModel`: route ini memang sengaja
    // melanggar FK dan `create` tidak ada dalam operasi yang di-scope.
    await this.prisma.storeMembers.create({
      data: { storeId: body.storeId, userId: body.userId, role: 'STAFF' },
    });
    return { ok: true };
  }

  @Post()
  echo(@Body() body: EchoTestDto): { data: EchoTestDto } {
    return { data: body };
  }

  /** Melempar `AppError` 5xx yang pesannya memuat detail koneksi DB. */
  @Get('boom-app-error')
  boomAppError(): never {
    throw new AppError(
      'DB_DOWN',
      500,
      'mariadb connect refused to 127.0.0.1:3306 as root',
    );
  }

  /** Melempar `HttpException` 5xx tanpa kode aplikasi. */
  @Get('boom-http')
  boomHttp(): never {
    throw new InternalServerErrorException(
      'upstream failure at 10.0.0.5:3306 for tenant acme',
    );
  }
}

@Module({ controllers: [EchoTestController] })
class EchoTestModule {}

/**
 * Route yang carries KEDUA dekorator otorisasi, untuk menguji URUTAN rantai
 * guard global (R-17).
 *
 * Route produksi mana pun belum memakai `@Roles()` dan `@StoreAccess()`
 * bersamaan, jadi tanpa route ini urutan guard tidak bisa diamati dari luar -
 * dan R-17 hanya bisa "dibuktikan" dengan membaca daftar provider, yang
 * persis klaim yang tidak bisa direproduksi.
 */
@Controller('echo/guard-order')
class GuardOrderTestController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':storeId')
  @Roles('ADMIN')
  @StoreAccess()
  async both(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ storeId: string; userId: string; role: string }> {
    const store = await this.prisma.stores.findUniqueOrThrow({
      where: { id: storeId },
      select: { id: true },
    });
    return { storeId: store.id, userId: user.userId, role: user.role };
  }
}

@Module({ controllers: [GuardOrderTestController] })
class GuardOrderTestModule {}
/**
 * Build instance Nest untuk e2e test dengan pipeline identik dengan produksi.
 *
 * `StoreOpsTestModule` yang dulu ada di sini sudah DIHAPUS pada Task 5: route
 * test-only `/echo/store-ops/*` berdiri sebagai pengganti sementara untuk
 * `POST /stores/:storeId/invitations`, `PATCH /stores/:storeId/members/:userId`,
 * dan `DELETE /stores/:storeId/members/:userId`. Ketiganya sekarang ada di
 * `src/` dengan dekorator yang sama, jadi menyimpan stand-in-nya hanya berarti
 * menguji route yang tidak dipakai siapa pun.
 *
 * Yang TETAP ada di sini: `EchoTestModule` (ValidasiPipe + filter error) dan
 * `GuardOrderTestModule` (urutan guard R-17). Keduanya masih menggantikan
 * sesuatu yang belum ada di produksi.
 *
 * - `logger: false` supaya output test bersih.
 * - Throttler di-override dengan limit tinggi supaya rate limit tidak membuat
 *   test flaky di spec 11 risiko 1-3.
 * - `throttlerOptions` tersedia untuk test yang memang MEMBUTUHKAN
 *   limit aktif (test rate limit). Default-nya longgar; passing `null`
 *   memakai konfigurasi produksi apa adanya.
 */
export async function buildTestApp(
  options: { throttlerOptions?: unknown[] | null } = {},
): Promise<INestApplication> {
  const throttlerOptions =
    options.throttlerOptions === undefined || options.throttlerOptions === null
      ? [{ name: 'default', ttl: 60_000, limit: 10_000 }]
      : options.throttlerOptions;

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, EchoTestModule, GuardOrderTestModule],
  })
    .overrideProvider(getOptionsToken())
    .useValue(throttlerOptions)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, moduleRef.get<AppConfig>(APP_CONFIG));
  await app.init();
  return app;
}
