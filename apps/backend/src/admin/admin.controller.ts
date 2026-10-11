import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/types/prisma-enums.js';
import { PageQueryDto } from '../common/dto/response.dto.js';
import type { ApiResponse, PaginatedMeta } from '../common/dto/response.dto.js';
import type { StoreStatus } from '../common/types/prisma-enums.js';

/** Bentuk baris toko pada daftar admin. */
interface AdminStoreView {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
  createdById: string;
  createdAt: string;
}

/**
 * Endpoint admin platform.
 *
 * Perhatikan apa yang TIDAK ada di sini: `@StoreAccess()`.
 *
 * Daftar toko lintas tenant memang wewenang admin, dan `@Roles('ADMIN')`
 * sudah membatasi siapa yang boleh memanggilnya. Endpoint ini juga TIDAK
 * memberi akses ke data bisnis toko - untuk itu user harus jadi anggota
 * (R-18). Jadi `GET /admin/stores` adalah directory platform, bukan pintu
 * belakang ke data UMKM orang.
 */
@ApiBearerAuth('bearer')
@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stores')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Daftar seluruh toko di platform (khusus ADMIN)' })
  async listStores(
    @Query() query: PageQueryDto,
  ): Promise<ApiResponse<AdminStoreView[]> & { meta: PaginatedMeta }> {
    const { page, pageSize } = query;

    // `stores` bukan model tenant, jadi tidak ada `tenantModel` yang bisa
    // dipakai - dan memang tidak boleh: justru inilah tujuan endpoint ini,
    // membaca lintas toko. Yang membatasi adalah `@Roles('ADMIN')`.
    const [rows, total] = await Promise.all([
      this.prisma.stores.findMany({
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stores.count(),
    ]);

    return {
      data: rows.map((store) => ({
        id: store.id,
        name: store.name,
        city: store.city,
        timezone: store.timezone,
        status: store.status,
        createdById: store.createdById,
        createdAt: store.createdAt.toISOString(),
      })),
      meta: { page, pageSize, total },
    };
  }
}