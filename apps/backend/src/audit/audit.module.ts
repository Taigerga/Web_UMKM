import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { AuditService } from './audit.service.js';

/**
 * Modul audit.
 *
 * `@Global()` supaya `AuditService` tersedia di modul auth, users, stores,
 * invitations, dan admin tanpa lima import yang mudah terlupa satu. Alasan
 * yang sama sudah dipakai `PrismaModule`, dan risikonya sama: menambah
 * dependensi tidak terlihat di daftar import modul.
 *
 * `AuditService` sengaja diekspor dari modul yang memanggilnya, bukan
 * disuntik lewat dekorator atau interceptor. Poinnya justru bahwa penulisan
 * audit terjadi DI DALAM operasi bisnis, setelah operasi itu berhasil - bukan
 * sebagai efek samping request. Kalau penulisannya dipindah ke interceptor,
 * audit akan mencatat permintaan yang ditolak guard dan permintaan ke Endpoint
 * yang tidak ada, yang bukan aktivitas pengguna.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}