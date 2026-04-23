import path from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['./__benchmarks__/utils/global-setup.ts'],
    benchmark: {
      include: ['__benchmarks__/**/*.bench.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      outputFile: '.performance/benchmark-results.json',
    },
  },
});
