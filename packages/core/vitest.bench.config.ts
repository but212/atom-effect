import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** Path to the library source root for alias resolution. */
const SRC_PATH = path.resolve(__dirname, 'src');

/**
 * Vitest Benchmark Configuration: Core Engine
 *
 * Defines the specialized environment for measuring the performance of the
 * core reactive engine. This configuration is isolated from standard unit tests
 * to ensure high-fidelity measurements and to prevent interference from DOM
 * emulation or test-specific mocks.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': SRC_PATH,
    },
  },
  test: {
    /**
     * Reason: Isolated Execution Environment
     * Uses the 'node' environment to minimize overhead during benchmarking.
     * This avoids the performance costs of JSDOM or other browser emulations,
     * providing more stable and reproducible results for pure logic tests.
     */
    environment: 'node',
    benchmark: {
      include: ['__benchmarks__/**/*.bench.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      /**
       * Logic: Diagnostic Persistence
       * Persists results to a dedicated directory for historical performance
       * tracking and regression analysis.
       */
      outputFile: '.performance/benchmark-results.json',
    },
  },
});
