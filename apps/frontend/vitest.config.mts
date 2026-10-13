import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Konfigurasi Vitest.
 *
 * ## Kenapa Vitest (GATE-T8-B)
 *
 * Tiga alasan, dan ketiganya bisa diperiksa bukan outages preference:
 *
 * 1. **Repo ini sudah memakainya.** `apps/backend` menjalankan
 *    `vitest run` dengan konfigurasi dan versi yang sama (4.x). Satu test runner
 *    untuk dua package berarti satu tutorial, satu cache dependensi, satu
 *    bentuk konfigurasi — dan tidak ada langkah "kenapa frontend pakai yang
 *    lain" yang harus dijelaskan setiap kali ada yang baru.
 * 2. **Vite sudah ada.** `next dev` dan `next build` di package ini berjalan
 *    di atas Vite lewat Turbopack. Vitest memakai pipeline transform yang
 *    sama, jadi test tidak butuh Babel atau konfigurasi TS terpisah.
 * 3. **Hemat untuk yang diuji.** Yang perlu diuji di task ini adalah modul
 *    murni (pemetaan `details` ke field, pembacaan cookie, parsing
 *    `Retry-After`, penentu redirect) dan sekilas render Client Component.
 *    Semuanya berjalan di Vitest tanpa browser.
 *
 * Yang TIDAK dipilih: Playwright. Ia jawaban yang tepat untuk alur end-to-end
 * di browser sungguhan, tapi biayanya jauh lebih besar (binary browser,
 * runner kedua, basis test kedua) dan tidak memberi apa pun untuk modul-modul
 * murni di atas. Bukti alur nyata di browser tetap diambil lewat
 * `next-dev-loop` saat verifikasi manual, bukan lewat runner ini.
 *
 * `jsdom` dipakai karena Client Component butuh `document` — antara lain untuk
 * `document.cookie` yang jadi sumber token di `auth-session.ts`.
 */
export default defineConfig({
  // `resolve.tsconfigPaths` bawaan Vite, bukan plugin `vite-tsconfig-paths`:
  // Vite sudah mendukung alias `paths` secara native dan plugin itu sekarang
  // hanya menampilkan peringatan.
  resolve: { tsconfigPaths: true },
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    restoreMocks: true,
  },
});
