import { defineVitestConfig } from '@but212/atom-effect-configs';
import { playwright } from '@vitest/browser-playwright';

export default defineVitestConfig(import.meta.dirname)({
  test: {
    setupFiles: ['./__tests__/setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
