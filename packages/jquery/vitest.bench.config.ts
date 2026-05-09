import { defineVitestBenchConfig } from '@but212/atom-effect-configs';
import { playwright } from '@vitest/browser-playwright';

export default defineVitestBenchConfig(import.meta.dirname, {
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['./__benchmarks__/utils/global-setup.ts'],
    benchmark: {
      outputFile: '.performance/results/benchmark-results.json',
    },
  },
});
