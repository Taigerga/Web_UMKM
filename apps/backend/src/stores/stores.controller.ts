import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../common/errors/app-error.js';
import { StoreMemberRole } from '../common/types/prisma-enums.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { StoreAccess } from '../common/decorators/store-access.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import type { ApiResponse } from '../common/dto/response.dto.js';
import { StoreAccessService, type StoreSummary } from './store-access.service.js';
import { UpdateStoreDto } from './dto/update-store.dto.js';

/** Bentuk anggota toko yang boleh keluar ke client. */
interface StoreMemberView {
  userId: string;
  role: StoreMemberRole;
  joinedAt: string;
  user: { id: string; email: string; name: string; role: string };
}

/** Bentuk toko yang boleh keluar ke client. */
interface StoreView {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: string;
}

/**
 * Endpoint toko milik user sendiri.
 *
 * Setiap route yang menyentuh satu toko bertanda `@StoreAccess()`, dan
 * `storeId`-nya SELALU diambil dari `@Param('storeId')`. Tidak ada satu pun
 * handler di sini yang membaca `query.storeId` atau `body.storeId` - kalau
 * ada, `?storeId=<toko lain>` akan cukup untuk melewati seluruh gerbang.
 *
 * `GET /stores` berbeda: ia tidak punya `:storeId`, jadi tidak memakai
 * `@StoreAccess()`. Daftar yang dikembalikan berasal dari
 * `StoreAccessService.listAccessible(userId)` - keanggotaan milik user itu
 * sendiri, bukan dari parameter apa pun yang dikirim klien.
 */
@ApiBearerAuth('bearer')
@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeAccess: StoreAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Daftar toko milik user (hanya yang dia jadi anggota)' })
  async list(@CurrentUser() user: AuthUser): Promise<ApiResponse<StoreSummary[]>> {
    return { data: await this.storeAccess.listAccessible(user.userId) };
  }

  @Get(':storeId')
  @StoreAccess()
  @ApiOperation({ summary: 'Detail satu toko' })
  async detail(@Param('storeId') storeId: string): Promise<ApiResponse<StoreView>> {
    const store = await this.prisma.stores.findUnique({ where: { id: storeId } });
    // `StoreScopeGuard` sudah memastikan user adalah anggota aktif toko ini,
    // jadi kemunculan `null` di sini berarti keadaan tidak konsisten, bukan
    // "toko tidak ada milikmu" - dan 404 tidak membocorkan keberadaannya.
    if (!store) throw AppError.notFound('Toko tidak ditemukan.', 'STORE_NOT_FOUND');

    const { id, name, city, timezone, status } = store;
    return { data: { id, name, city, timezone, status } };
  }

  @Patch(':storeId')
  @StoreAccess(StoreMemberRole.OWNER)
  @ApiOperation({ summary: 'Ubah nama/kota toko (OWNER toko tersebut)' })
  async update(
    @Param('storeId') storeId: string,
    @Body() dto: UpdateStoreDto,
  ): Promise<ApiResponse<StoreView>> {
    const store = await this.prisma.stores.update({
      where: { id: storeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
      },
    });

    const { id, name, city, timezone, status } = store;
    return { data: { id, name, city, timezone, status } };
  }

  @Delete(':storeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @StoreAccess(StoreMemberRole.OWNER)
  @ApiOperation({ summary: 'Hapus toko (OWNER toko tersebut)' })
  async remove(@Param('storeId') storeId: string): Promise<void> {
    // `stores` bukan model tenant (primary key-nya `id`, tidak punya kolom
    // `storeId`), jadi tidak bisa lewat `tenantModel`. Yang menggantikannya
    // adalah `@StoreAccess('OWNER')`: keanggotaan sudah diverifikasi guard
    // sebelum baris ini dieksekusi.
    await this.prisma.stores.delete({ where: { id: storeId } });
  }

  /**
   * Daftar anggota toko.
   *
   * Ini tempat `PrismaService.tenantModel` benar-benar menentukan hasil, bukan
   * cuma penguat: tanpa itu, `findMany({})` di delegate mentah mengembalikan
   * seluruh baris `store_members` di database - termasuk anggota toko lain.
   * Guard hanya membuktikan user adalah anggota toko ini; ia tidak menyaring
   * baris mana yang dibaca. Test IDOR "OWNER toko A tidak bisa melihat member
   * toko B" menguji justru hal itu, dan test itu gagal kalau baris di bawah
   * diganti `this.prisma.storeMembers`.
   */
  @Get(':storeId/members')
  @StoreAccess()
  @ApiOperation({ summary: 'Daftar anggota toko' })
  async members(@Param('storeId') storeId: string): Promise<ApiResponse<StoreMemberView[]>> {
    const rows = await this.prisma
      .tenantModel('storeMembers', storeId)
      .findMany({
        orderBy: { joinedAt: 'asc' },
        include: { user: { select: { id: true, email: true, name: true, role: true } } },
      });

    const data = rows.map((row) => ({
      userId: row.userId,
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
      user: row.user,
    }));

    return { data };
  }
}