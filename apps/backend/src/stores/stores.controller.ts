import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, StoreMemberRole } from '../common/types/prisma-enums.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StoreAccess } from '../common/decorators/store-access.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import type { ApiResponse } from '../common/dto/response.dto.js';
import { StoreAccessService, type StoreSummary } from './store-access.service.js';
import { StoresService } from './stores.service.js';
import type {
  CreatedStoreView,
  IssuedInvitationView,
  StoreMemberView,
  StoreView,
} from './stores.service.js';
import { CreateStoreDto } from './dto/create-store.dto.js';
import { UpdateStoreDto } from './dto/update-store.dto.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';

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
 *
 * ## Guard bukan satu-satunya lapisan
 *
 * `@StoreAccess()` di sini adalah pemeriksaan PERTAMA. Lapisan kedua ada di
 * `StoresService`: setiap method-nya memanggil `assertAccess` lagi sebelum
 * menyentuh data. Lapisan kedua itu yang membuat aturan "toko suspended
 * memblokir baca dan tulis" tetap berlaku untuk pemanggil service yang bukan
 * HTTP - test "toko SUSPENDED memblokir baca dan tulis di layer service"
 * memanggil `StoresService` langsung, tanpa guard sama sekali.
 *
 * ## Kenapa tidak ada `DELETE /stores/:storeId`
 *
 * Controller ini pernah punya route itu dan route-nya DIHAPUS pada review.
 * Alasannya bukan bug dan bukan lubang: route itu memang tidak punya pemilik
 * di spec maupun di plan. `stores` tidak punya `deletedAt`, jadi penghapusan
 * adalah `DELETE` keras dengan `onDelete: Cascade` ke `store_members` dan
 * `store_invites` - dan jejak auditnya baru akan ada di Task 6. Endpoint yang
 * bisa menghapus seluruh riwayat anggota sebuah UMKM tanpa jejak adalah
 * kapabilitas yang harus diminta dengan sadar, bukan yang muncul karena
 * seseorang butuh satu route untuk menguji IDOR.
 *
 * R-19 mengunci ketiadaannya: test "R-19: penghapusan toko tetap tidak ada"
 * memanggil `DELETE /stores/:storeId` dan mengharapkan 404.
 *
 * Endpoint yang memang ada di spec dan tetap hidup di sini: `DELETE
 * /stores/:storeId/members/:userId`, yaitu hapus ANGGOTA, bukan hapus toko.
 */
@ApiBearerAuth('bearer')
@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly storeAccess: StoreAccessService,
  ) {}

  /**
   * Buat toko baru; pemanggil otomatis jadi OWNER.
   *
   * `@Roles(OWNER)` mengikuti matriks izin spec 6.4 ("Buat toko: OWNER ya,
   * ADMIN tidak, STAFF tidak"). Peran yang dibaca di sini adalah peran PLATFORM
   * dari token, jadi ini bukan gerbang keanggotaan toko dan `assertAccess` tidak
   * relevan: setiap user yang baru daftar sudah punya peran platform OWNER dan
   * tidak memiliki toko sama sekali, dan itulah yang membuat langkah "buat toko"
   * tersedia baginya.
   */
  @Post()
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Buat toko (pemanggil otomatis jadi OWNER)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStoreDto,
  ): Promise<ApiResponse<CreatedStoreView>> {
    return { data: await this.stores.create(user.userId, dto) };
  }

  @Get()
  @ApiOperation({ summary: 'Daftar toko milik user (hanya yang dia jadi anggota)' })
  async list(@CurrentUser() user: AuthUser): Promise<ApiResponse<StoreSummary[]>> {
    return { data: await this.storeAccess.listAccessible(user.userId) };
  }

  @Get(':storeId')
  @StoreAccess()
  @ApiOperation({ summary: 'Detail satu toko' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
  ): Promise<ApiResponse<StoreView>> {
    return { data: await this.stores.get(user.userId, storeId) };
  }

  @Patch(':storeId')
  @StoreAccess(StoreMemberRole.OWNER)
  @ApiOperation({ summary: 'Ubah nama/kota toko (OWNER toko tersebut)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Body() dto: UpdateStoreDto,
  ): Promise<ApiResponse<StoreView>> {
    return { data: await this.stores.update(user.userId, storeId, dto) };
  }

  /**
   * Daftar anggota toko.
   *
   * Query-nya ada di `StoresService.members`, yang memakai
   * `PrismaService.tenantModel`. Tanpa itu, `findMany({})` di delegate mentah
   * mengembalikan seluruh baris `store_members` di database - termasuk anggota
   * toko lain. Guard hanya membuktikan user adalah anggota toko ini; ia tidak
   * menyaring baris mana yang dibaca. Test IDOR "OWNER toko A tidak bisa melihat
   * member toko B" menguji justru hal itu, dan test itu gagal kalau baris di
   * service diganti `this.prisma.storeMembers`.
   */
  @Get(':storeId/members')
  @StoreAccess()
  @ApiOperation({ summary: 'Daftar anggota toko' })
  async members(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
  ): Promise<ApiResponse<StoreMemberView[]>> {
    return { data: await this.stores.members(user.userId, storeId) };
  }

  /**
   * OWNER-only: cabut keanggotaan seorang anggota.
   *
   * Owner terakhir dilindungi `LAST_OWNER` (409) di `StoresService.removeMember`
   * - bukan di sini, supaya aturan itu juga berlaku untuk pemanggil non-HTTP.
   */
  @Delete(':storeId/members/:userId')
  @StoreAccess(StoreMemberRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cabut keanggotaan anggota (OWNER toko; owner terakhir dilindungi LAST_OWNER)',
  })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Param('userId') targetUserId: string,
  ): Promise<void> {
    await this.stores.removeMember(user.userId, storeId, targetUserId);
  }

  /**
   * OWNER-only: ubah peran seorang anggota.
   *
   * `userId` di path adalah TARGET, bukan pemanggil. Hak aksesnya tetap
   * dihitung dari `@CurrentUser()`: tidak ada cara menuliskan "ubah peran diriku
   * sendiri" lewat body. Menurunkan owner terakhir ditolak `LAST_OWNER` di
   * `StoresService.updateMember`.
   */
  @Patch(':storeId/members/:userId')
  @StoreAccess(StoreMemberRole.OWNER)
  @ApiOperation({
    summary: 'Ubah peran anggota (OWNER toko; owner terakhir dilindungi LAST_OWNER)',
  })
  async updateMember(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<ApiResponse<{ userId: string; role: StoreMemberRole }>> {
    return { data: await this.stores.updateMember(user.userId, storeId, targetUserId, dto) };
  }

  /**
   * OWNER-only: terbitkan undangan. Token mentah dikembalikan SEKALI di sini.
   *
   * Respons juga membawa `id`, `email`, `role`, dan `expiresAt` supaya frontend
   * bisa menampilkan detail undangan yang baru dibuat - tapi TIDAK `tokenHash`,
   * karena yang disimpan di database hanya digest-nya (R-22).
   */
  @Post(':storeId/invitations')
  @StoreAccess(StoreMemberRole.OWNER)
  @ApiOperation({
    summary: 'Terbitkan undangan (OWNER toko; token mentah hanya dikembalikan sekali)',
  })
  async invite(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<ApiResponse<IssuedInvitationView>> {
    return { data: await this.stores.invite(user.userId, storeId, dto) };
  }
}