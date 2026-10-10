import { Module, Post, Body, Controller } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerModule, getOptionsToken } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap.js';
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
}

@Controller('echo')
class EchoTestController {
  @Post()
  echo(@Body() body: EchoTestDto): { data: EchoTestDto } {
    return { data: body };
  }
}

@Module({ controllers: [EchoTestController] })
class EchoTestModule {}

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL:
    'mysql://root@127.0.0.1:3306/bisnis_insight_test',
  // Panjang >= 32 agar `loadConfig` menerimanya.
  JWT_SECRET: 'test-secret-for-e2e-only-min-32-chars',
};

/**
 * Build instance Nest untuk e2e test dengan pipeline identik dengan produksi.
 *
 * - `logger: false` supaya output test bersih.
 * - Throttler di-override longgar (limit 10000 / ttl 60s) supaya rate limit
 *   tidak membuat test flaky (spec §11 risiko 1-3).
 * - Tidak ada APP_GUARD: guard global dipasang di task autentikasi.
 */
export async function buildTestApp(): Promise<INestApplication> {
  for (const [key, value] of Object.entries(TEST_ENV)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

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

export { ThrottlerModule };