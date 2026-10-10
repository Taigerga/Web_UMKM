// WAJIB import pertama: menyetel process.env sebelum `app.module.js`
// mengevaluasi `ConfigModule.forRoot()` dan memuat `.env` lokal developer.
import './test-env.js';

import { Body, Controller, Get, Module, Post } from '@nestjs/common';
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

@Controller('echo')
class EchoTestController {
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
 * Build instance Nest untuk e2e test dengan pipeline identik dengan produksi.
 *
 * - `logger: false` supaya output test bersih.
 * - Throttler di-override longgar (limit 10000 / ttl 60s) supaya rate limit
 *   tidak membuat test flaky (spec §11 risiko 1-3).
 * - Tidak ada APP_GUARD: guard global dipasang di task autentikasi.
 */
export async function buildTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, EchoTestModule],
  })
    .overrideProvider(getOptionsToken())
    .useValue([{ name: 'default', ttl: 60_000, limit: 10_000 }])
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, moduleRef.get<AppConfig>(APP_CONFIG));
  await app.init();
  return app;
}