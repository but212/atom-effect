import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for benchmarks
 * Separate from test/build configuration to avoid conflicts
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./__benchmarks__/utils/global-setup.ts'],
    benchmark: {
      include: ['__benchmarks__/**/*.bench.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      outputFile: '.performance/benchmark-results.json',
    },
  },
});
