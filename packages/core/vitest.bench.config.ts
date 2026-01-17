import path from 'node:path';
import { defineConfig } from 'vitest/config';

const SRC_PATH = path.resolve(__dirname, 'src');

/**
 * Vitest configuration for benchmarks
 * Separate from test configuration to avoid conflicts
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': SRC_PATH,
    },
  },
  test: {
    // Use single environment to prevent duplicate benchmark runs
    environment: 'node',
    benchmark: {
      include: ['__benchmarks__/**/*.bench.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      // Benchmark-specific options
      outputFile: '.performance/benchmark-results.json',
    },
  },
});
