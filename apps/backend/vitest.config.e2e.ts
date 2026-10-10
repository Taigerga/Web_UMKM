import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    // Hanya e2e. Butuh MySQL hidup (Laravel/Laragon) di 127.0.0.1:3306 dan
    // memakai database `bisnis_insight_test`.
    include: ['test/**/*.e2e.spec.ts'],
    // Test e2e berbagi satu database; jalan berbarengan bisa saling menimpa
    // data sehingga flaky.
    fileParallelism: false,
  },
});