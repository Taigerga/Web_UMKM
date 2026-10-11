import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import type { ApiResponse } from '../common/dto/response.dto.js';
import { InvitationsService } from './invitations.service.js';
import type { AcceptedInvitation, InvitationPreview } from './invitations.service.js';

/**
 * Endpoint undangan, di luar `/stores`.
 *
 * ## Kenapa `preview` bersifat publik
 *
 * `@Public()` di sini bukan pelonggaran: halaman undangan di spec 7.1 ada di
 * grup `(auth)` yang publik, dan penerima undangan belum tentu punya akun -
 * belum tentu pula sudah tahu apakah dia mau daftar. Yang membuatnya tidak
 * berbahaya adalah tokennya: 256 bit acak yang hanya ada di email, dan yang
 * disimpan di server hanya digest-nya. Preview tidak memuat `tokenHash`,
 * `storeId`, atau `id` baris - hanya email tujuan, nama toko, peran, dan
 * kedaluwarsa.
 *
 * `accept` TIDAK diberi `@Public()`: keanggotaan hanya boleh dibuat untuk user
 * yang sudah terautentikasi, sehingga tidak ada jalur yang membuat akun sambil
 * menerima undangan.
 */
@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get(':token')
  @Public()
  @ApiOperation({ summary: 'Ringkasan undangan sebelum diterima (publik)' })
  async preview(@Param('token') token: string): Promise<ApiResponse<InvitationPreview>> {
    return { data: await this.invitations.preview(token) };
  }

  @Post(':token/accept')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Terima undangan dan menjadi anggota toko dengan role yang diundang' })
  async accept(
    @Param('token') token: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<AcceptedInvitation>> {
    return { data: await this.invitations.accept(token, user.userId) };
  }
}