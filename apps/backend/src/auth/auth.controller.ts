import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppError } from '../common/errors/app-error.js';
import { AuthService } from './auth.service.js';
import type { AuthProfile, AuthSession, PublicUser } from './auth.service.js';
import { AuthCookieService } from './auth-cookie.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { APP_CONFIG } from '../config/configuration.js';
import type { AppConfig } from '../config/configuration.js';
import type { AuthenticatedUser } from './jwt.strategy.js';
import type { ApiResponse } from '../common/dto/response.dto.js';

/** Bentuk respons sukses yang memuat user + access token. */
interface SessionBody {
  user: PublicUser;
  accessToken: string;
  /** Detik sampai refresh token kedaluwarsa; mudah dipakai frontend. */
  refreshExpiresAt: string;
}

/**
 * Endpoint autentikasi.
 *
 * `@Public()` dipasang PER HANDLER, bukan di level kelas, dan itu disengaja:
 * `JwtAuthGuard` membaca metadata dengan `getAllAndOverride`, yang mengembalikan
 * nilai PERTAMA yang ditemukan di `[handler, class]`. Kalau `@Public()` diletakkan
 * di kelas, `me` - yang butuh JWT - ikut terbaca publik, guard dilewati, dan
 * `req.user` tetap `undefined`. Per-handler membuat setiap route menyatakan
 * sendiri apakah dia publik, dan tidak ada pewarisan yang mengejutkan.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: AuthCookieService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Daftar akun baru (role selalu OWNER, tanpa toko)' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<SessionBody>> {
    const session = await this.authService.register(dto);
    this.cookies.setSessionCookies(response, session);
    return { data: toSessionBody(session) };
  }

  @Post('login')
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Masuk dan terima access + refresh token' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<SessionBody>> {
    const session = await this.authService.login(dto);
    this.cookies.setSessionCookies(response, session);
    return { data: toSessionBody(session) };
  }

  @Post('refresh')
  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Tukar refresh token cookie dengan access + refresh token baru',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<SessionBody>> {
    const presented = this.readRefreshCookie(request);
    if (!presented) {
      // Cookie tidak ada di `req.cookies` (tidak terkirim, atau path-nya salah).
      // Pesan yang sama seperti token tak dikenal supaya tidak bisa dipakai
      // untuk membedakan "tidak punya cookie" dari "cookie tidak valid".
      throw AppError.unauthorized(
        'Refresh token tidak ditemukan. Silakan masuk kembali.',
        'REFRESH_TOKEN_MISSING',
      );
    }

    const session = await this.authService.refresh(presented);
    // Cookie access di-set ulang di sini juga, bukan hanya saat login, supaya
    // body dan cookie tidak pernah berisi token berbeda (R-9).
    this.cookies.setSessionCookies(response, session);
    return { data: toSessionBody(session) };
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cabut refresh token sesi ini' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    // Tanpa cookie refresh, logout tetap sukses: tidak ada sesi aktif untuk
    // dicabut, dan 401 di sini hanya akan membingungkan frontend.
    const presented = this.readRefreshCookie(request);
    if (presented) await this.authService.logout(presented);
    this.cookies.clearSessionCookies(response);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'User yang sedang login beserta toko yang bisa diakses',
  })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponse<AuthProfile>> {
    return { data: await this.authService.me(user.userId) };
  }

  /**
   * Ambil refresh token dari cookie.
   *
   * `req.cookies` diisi oleh `cookie-parser` yang dipasang di `configureApp`,
   * jadi controller tidak perlu parses header `Cookie` sendiri.
   */
  private readRefreshCookie(request: Request): string | undefined {
    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[this.config.refreshCookieName];
  }
}

/**
 * Bentuk body respons sesi.
 *
 * `refreshToken` SENGAJA tidak ada di sini: ia hanya boleh keluar lewat cookie
 * HttpOnly. Mengembalikannya di body akan membatalkan seluruh alasan kenapa
 * cookie itu HttpOnly, karena `fetch` di browser tetap bisa membacanya.
 */
function toSessionBody(session: AuthSession): SessionBody {
  return {
    user: session.user,
    accessToken: session.accessToken,
    refreshExpiresAt: session.refreshExpiresAt.toISOString(),
  };
}