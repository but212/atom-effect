import { createVitestBenchConfig } from '@but212/configs';
import { playwright } from '@vitest/browser-playwright';

export default createVitestBenchConfig(import.meta.dirname, {
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
