/**
 * Environment khusus test. WAJIB diimpor sebelum `src/app.module.js`.
 *
 * `ConfigModule.forRoot()` dipanggil saat `app.module.js` dievaluasi, dan
 * `@nestjs/config` hanya menulis `.env` ke `process.env` untuk key yang belum
 * ada (`override` default false). Jadi nilai di sini ditulis **tanpa syarat**
 * lebih dulu, dan otomatis menang atas `.env` lokal developer.
 *
 * Import ESM dievaluasi berurutan, jadi file ini harus berada di baris import
 * pertama `test-app.ts`.
 */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'mysql://root@127.0.0.1:3306/bisnis_insight_test',
  // Panjang >= 32 agar `loadConfig` menerimanya.
  JWT_SECRET: 'test-secret-for-e2e-only-min-32-chars',
};

// Ditulis tanpa syarat: nilai test harus menang atas `.env` lokal.
for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}