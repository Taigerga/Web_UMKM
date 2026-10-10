import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, setupSwagger } from './bootstrap.js';
import { APP_CONFIG } from './config/configuration.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Config sudah divalidasi saat provider APP_CONFIG di-resolve.
  const config = app.get<AppConfig>(APP_CONFIG);

  configureApp(app, config);
  setupSwagger(app);

  await app.listen(config.port);
}

await bootstrap();