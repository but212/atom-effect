import { defineConfig } from 'vitest/config';

/** Path to the library source root for alias resolution. */
const SRC_PATH = `${import.meta.dirname}/src`;

export default defineConfig({
  resolve: {
    alias: {
      '@': SRC_PATH,
    },
  },
  test: {
    environment: 'node',
    benchmark: {
      include: ['__benchmarks__/**/*.bench.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      outputFile: '.performance/benchmark-results.json',
    },
  },
});
