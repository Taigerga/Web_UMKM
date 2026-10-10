import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Menyediakan `PrismaService` ke seluruh aplikasi tanpa harus mengimpor
 * modul ini di setiap feature module.
 *
 * `@Global()` disengaja: satu pool koneksi per proses, dan setiap consumer
 * otomatis memakai instance yang sama.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}