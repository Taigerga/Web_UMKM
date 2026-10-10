import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    // Unit test saja. File e2e butuh MySQL yang hidup, jadi punya config
    // sendiri (`vitest.config.e2e.ts`) agar `npm test` tetap bisa jalan di
    // lingkungan tanpa database.
    include: ['src/**/*.spec.ts'],
  },
});