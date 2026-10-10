import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module.js';
import { APP_CONFIG } from './config/configuration.js';
import { appConfigProvider } from './config/app-config.provider.js';
import { PrismaModule } from './database/prisma.module.js';

/**
 * Default rate limit global. Endpoint auth akan menimpanya dengan nilai yang
 * lebih ketat di task autentikasi (5 percobaan / menit per IP+email).
 */
export const DEFAULT_THROTTLE_OPTIONS = [
  { name: 'default', ttl: 60_000, limit: 300 },
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ThrottlerModule.forRoot(DEFAULT_THROTTLE_OPTIONS),
    PrismaModule,
    HealthModule,
  ],
  providers: [appConfigProvider],
  exports: [APP_CONFIG],
})
export class AppModule {}