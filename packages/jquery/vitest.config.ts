import { createVitestConfig } from '@but212/configs';
import { playwright } from '@vitest/browser-playwright';

export default createVitestConfig(import.meta.dirname, {
  test: {
    setupFiles: ['./__tests__/setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
