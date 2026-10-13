import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { auditContextMiddleware } from './audit/audit-context.middleware.js';
import type { AppConfig } from './config/configuration.js';

/**
 * Setup global yang dipakai `main.ts` dan helper test, supaya keduanya
 * memakai pipeline yang identik (prefix, CORS, helmet, validasi, filter).
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.use(helmet());
  // CONTEXT REQUEST SEBELUM FILTER: `AllExceptionsFilter` butuh `request.url`
  // untuk redaksi token undangan, dan `AuditService` butuh ip + user-agent
  // untuk mengisi kolomnya. Keduanya membaca request yang sama, jadi satu
  // middleware cukup untuk keduanya.
  app.use(auditContextMiddleware);
  app.enableCors({
    origin: config.corsOrigins,
    //Dibutuhkan untuk refresh token HttpOnly di task autentikasi.
    credentials: true,
    // Header throttle TIDAK bisa dibaca peramban lintas origin tanpa ini.
    //
    // `Retry-After` bukan response header yang aman secara CORS, jadi browser
    // menyembunyikannya dari JavaScript kecuali server menyebutkannya di
    // `Access-Control-Expose-Headers`. Tanpa baris ini `headers.get(...)` di
    // frontend selalu `null` untuk respons 429, dan pesan "coba lagi dalam N
    // detik" tidak pernah bisa muncul - bukan karena logikanya salah, tapi
    // karena nilainya tidak pernah sampai ke sisi peramban.
    //
    // Dua nama diekspos karena `@nestjs/throttler` memakai throttler bernama:
    // ia menulis `Retry-After-<nama>` untuk throttler yang punya nama
    // (`Retry-After-auth` di endpoint auth) dan `Retry-After` polos untuk
    // `default`. Yang aktif bergantung pada throttler mana yang menolak, jadi
    // keduanya perlu terbuka.
    exposedHeaders: ['Retry-After', 'Retry-After-auth'],
  });
  // WAJIB untuk endpoint refresh/logout: keduanya membaca refresh token dari
  // cookie. Tanpa ini `req.cookies` undefined dan logout tidak pernah mencabut
  // apa pun.
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
}

/** Pasang Swagger UI di `/docs` dengan skema bearerAuth. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('BisnisInsight API')
    .setDescription('API multi-tenant analitik untuk UMKM Indonesia.')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
