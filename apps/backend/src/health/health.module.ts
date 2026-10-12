import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { PrismaModule } from '../database/prisma.module.js';

/**
 * Modul kesehatan.
 *
 * `PrismaModule` diimpor karena `/health/details` menjalankan satu query untuk
 * memeriksa konektivitas database. `PrismaModule` memang `@Global()`, jadi
 * import ini tidak mengubah apa pun - hanya menyatakan dependensinya.
 */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}