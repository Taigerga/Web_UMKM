import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service.js';
import type { UserProfile } from './users.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import type { ApiResponse } from '../common/dto/response.dto.js';

/**
 * Endpoint profil diri.
 *
 * TIDAK diberi `@Public()`, jadi `JwtAuthGuard` global mengunci semuanya.
 * `userId` selalu diambil dari access token, tidak pernah dari body atau path,
 * sehingga tidak ada cara untuk mengedit profil user lain.
 */
@ApiBearerAuth('bearer')
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profil diri beserta toko yang bisa diakses' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponse<UserProfile>> {
    return { data: await this.usersService.getMe(user.userId) };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Ubah nama dan/atau email sendiri' })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApiResponse<UserProfile>> {
    return { data: await this.usersService.updateMe(user.userId, dto) };
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Ganti password sendiri (mencabut semua sesi aktif)',
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersService.changePassword(user.userId, dto);
  }
}