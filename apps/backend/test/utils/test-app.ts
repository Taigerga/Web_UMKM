import { randomUUID } from 'node:crypto';
// WAJIB import pertama: menyetel process.env sebelum `app.module.js`
// mengevaluasi `ConfigModule.forRoot()` dan memuat `.env` lokal developer.
import './test-env.js';

import { Body, Controller, Delete, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { InternalServerErrorException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import { IsEmail, IsEnum, IsInt, IsString, Min, MinLength } from 'class-validator';
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
import { StoreMemberRole } from '../../src/common/types/prisma-enums.js';

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
 * Route OWNER-only KHUSUS TEST untuk menguji gerbang `@StoreAccess('OWNER')`.
 *
 * Kenapa di file test dan bukan di `src/`: undangan anggota, pengubahan peran,
 * dan penghapusan anggota adalah endpoint NYATA yang tiba di Task 5, dan
 * membangunnya di sini berarti mendahului tugas itu dan menghasilkan endpoint
 * yang profesinya belum dipakai siapa pun.
 *
 * Yang sedang diuji TIDAK logika undangan/peran - melainkan keputusan
 * "hanya OWNER yang boleh lewat". Jadi route ini sengaja memakai dekorator
 * produksi yang sama persis. Kalau `@StoreAccess` tidak bekerja, test IDOR
 * gagal; kalau route-nya sendiri yang rusak, test positive-control (OWNER
 * berhasil) juga gagal.
 *
 * Sengaja TIDAK diberi `@Public()`: kalau iya, guard dilewati dan test
 * membuktikan apa yang tidak ada.
 */
class TestInviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(StoreMemberRole)
  role!: StoreMemberRole;
}

class TestRoleChangeDto {
  @IsEnum(StoreMemberRole)
  role!: StoreMemberRole;
}

@Controller('echo/store-ops')
class StoreOpsTestController {
  constructor(private readonly prisma: PrismaService) {}

  /** Bentuk upcoming `POST /stores/:storeId/invites` (Task 5). */
  @Post(':storeId/invites')
  @StoreAccess(StoreMemberRole.OWNER)
  async invite(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Body() body: TestInviteDto,
  ): Promise<{ id: string }> {
    const invite = await this.prisma.tenantModel('storeInvites', storeId).create({
      data: {
        // Tipe Prisma tetap menuntut `storeId` walau proxy memaksanya ke
        // scope. Nilainya di sini sengaja `storeId` yang sama supaya jelas
        // bahwa proxy-lah yang menjadi penjamin, bukan pemanggil.
        storeId,
        email: body.email,
        role: body.role,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedById: user.userId,
      },
    });
    return { id: invite.id };
  }

  /** Bentuk upcoming `PATCH /stores/:storeId/members/:userId` (Task 5). */
  @Patch(':storeId/members/:userId')
  @StoreAccess(StoreMemberRole.OWNER)
  async changeRole(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @Body() body: TestRoleChangeDto,
  ): Promise<{ userId: string; role: StoreMemberRole }> {
    const updated = await this.prisma
      .tenantModel('storeMembers', storeId)
      .update({
        where: { storeId_userId: { storeId, userId } },
        data: { role: body.role },
      });
    return { userId: updated.userId, role: updated.role };
  }

  /**
   * Route test-only untuk menguji gerbang OWNER-only pada operasi yang
   * MENGHAPUS.
   *
   * Penghapusan TOKO tidak ada di `src/` dan tidak akan ada di task ini: tidak
   * ada di spec, tidak ada di plan, `stores` tidak punya kolom soft-delete, dan
   * `store_members`/`store_invites` punya `onDelete: Cascade`. Endpoint produksi
   * yang bisa menghapus seluruh riwayat anggota sebuah UMKM tanpa jejak audit
   * (audit baru ada di Task 6) adalah kapabilitas yang harus diminta secara
   * eksplisit, bukan efek samping dari butuh satu route untuk test IDOR.
   *
   * Yang diuji di sini HANYA gerbangnya: `@StoreAccess('OWNER')` pada verb
   * `DELETE` menolak pemanggil yang bukan owner toko itu. Untuk itu route ini
   * memproses akses OWNER-only yang nyata dan bisa diamati (menghapus
   * keanggotaan, bukan tokonya) supaya positive control benar-benar membuktikan
   * route bisa dipakai OWNER. penghapusan anggota yang sebenarnya adalah
   * Task 5, lewat `DELETE /stores/:storeId/members/:userId`.
   */
  @Delete(':storeId/members/:userId')
  @StoreAccess(StoreMemberRole.OWNER)
  async removeMember(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
  ): Promise<{ removed: boolean }> {
    const result = await this.prisma
      .tenantModel('storeMembers', storeId)
      .delete({ where: { storeId_userId: { storeId, userId } } });
    return { removed: result.userId === userId };
  }
}

@Module({ controllers: [StoreOpsTestController] })
class StoreOpsTestModule {}

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
    imports: [AppModule, EchoTestModule, StoreOpsTestModule, GuardOrderTestModule],
  })
    .overrideProvider(getOptionsToken())
    .useValue(throttlerOptions)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, moduleRef.get<AppConfig>(APP_CONFIG));
  await app.init();
  return app;
}
