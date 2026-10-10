import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import type { AppConfig } from './config/configuration.js';

/**
 * Setup global yang dipakai `main.ts` dan helper test, supaya keduanya
 * memakai pipeline yang identik (prefix, CORS, helmet, validasi, filter).
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    //Dibutuhkan untuk refresh token HttpOnly di task autentikasi.
    credentials: true,
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