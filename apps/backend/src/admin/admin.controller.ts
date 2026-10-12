import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/types/prisma-enums.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PageQueryDto } from '../common/dto/response.dto.js';
import type { ApiResponse, PaginatedMeta } from '../common/dto/response.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { AdminService } from './admin.service.js';
import type { AdminStoreView, AdminUserView } from './admin.service.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';

/**
 * Endpoint admin platform.
 *
 * Perhatikan apa yang TIDAK ada di sini: `@StoreAccess()`.
 *
 * Daftar toko lintas tenant memang wewenang admin, dan `@Roles('ADMIN')` sudah
 * membatasi siapa yang boleh memanggilnya. Endpoint ini juga tidak memberi akses
 * ke data bisnis toko - untuk itu user harus jadi anggota (R-18). Jadi
 * `GET /admin/stores` adalah directory platform, bukan pintu belakang ke data
 * UMKM orang.
 *
 * `@Roles('ADMIN')` dipasang PER HANDLER, bukan di kelas. Alasannya sama dengan
 * `@Public()` di `HealthController` dan `AuthController`: penanda di level kelas
 * berlaku untuk semua route di dalamnya, dan satu route admin tanpa batas peran
 * akan lolos tanpa terlihat.
 */
@ApiBearerAuth('bearer')
@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Daftar seluruh user di platform (khusus ADMIN)' })
  async listUsers(
    @CurrentUser() user: AuthUser,
    @Query() query: PageQueryDto,
  ): Promise<ApiResponse<AdminUserView[]> & { meta: PaginatedMeta }> {
    const { page, pageSize } = query;
    const { rows, total } = await this.admin.listUsers(user.userId, page, pageSize);

    return { data: rows, meta: { page, pageSize, total } };
  }

  /**
   * Aktifkan/nonaktifkan akun.
   *
   * `userId` di path adalah TARGET, bukan pemanggil; pelaku selalu diambil dari
   * `@CurrentUser()`. `setUserStatus` juga menolak admin yang menonaktifkan
   * dirinya sendiri - lihat catatan di `AdminService`.
   */
  @Patch('users/:userId/status')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Aktifkan/nonaktifkan akun (khusus ADMIN; target di path, bukan pemanggil)',
  })
  async setUserStatus(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<ApiResponse<AdminUserView>> {
    return { data: await this.admin.setUserStatus(user.userId, userId, dto.isActive) };
  }

  @Get('stores')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Daftar seluruh toko di platform (khusus ADMIN)' })
  async listStores(
    @CurrentUser() user: AuthUser,
    @Query() query: PageQueryDto,
  ): Promise<ApiResponse<AdminStoreView[]> & { meta: PaginatedMeta }> {
    const { page, pageSize } = query;
    const { rows, total } = await this.admin.listStores(user.userId, page, pageSize);

    return { data: rows, meta: { page, pageSize, total } };
  }
}