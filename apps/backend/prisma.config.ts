/**
 * Konfigurasi Prisma 7 Development Kit (CLI).
 *
 * Di Prisma 7 `url` TIDAK lagi ada di dalam `schema.prisma`; koneksi CLI
 * (migrate, db pull, studio) dibaca dari sini lewat `datasource.url`.
 * Prisma Client saat runtime memakai driver adapter yang dikonstruksi di
 * `src/database/prisma.service.ts` — bukan file ini.
 *
 * Bentuk file ini diverifikasi terhadap paket yang terpasang
 * (`node_modules/@prisma/config/dist/index.d.ts`, prisma 7.10.0):
 * - `defineConfig` diekspor dari `prisma/config`;
 * - kunci yang diterima: `schema`, `datasource.url`, `migrations.path`,
 *   `experimental`, `tables`, `enums`, `views`, `typedSql`.
 *
 * CLI Prisma tidak memuat `.env` sendiri, jadi `dotenv/config` diimpor di sini.
 * Prisma mencari file konfigurasi dengan urutan: `prisma7.config.*` lalu
 * `prisma.config.*`. Nama `prisma.config.ts` masih didukung (kandidat legacy).
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prisma CLI memproses file ini dengan cwd = package root.
    url: process.env['DATABASE_URL'],
  },
});
