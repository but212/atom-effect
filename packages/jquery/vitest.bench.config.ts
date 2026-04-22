import path from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Vitest Benchmark Configuration: jQuery Integration
 *
 * Orchestrates high-fidelity performance measurements for reactive jQuery
 * bindings. Unlike the core engine, these benchmarks require a real browser
 * environment to accurately measure DOM manipulation overhead and jQuery
 * orchestration costs.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    /**
     * Reason: Real-World DOM Performance
     * Uses Playwright to execute benchmarks in a headless Chromium instance.
     * This is mandatory for capturing realistic performance metrics of
     * jQuery-based DOM operations and reactive updates.
     */
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['./__benchmarks__/utils/global-setup.ts'],
    /**
     * Logic: Performance Regression Tracking
     * Configures patterns for benchmark discovery and persists results to
     * a dedicated directory for historical analysis.
     */
    benchmark: {
      include: ['__benchmarks__/**/*.bench.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      outputFile: '.performance/benchmark-results.json',
    },
  },
});
