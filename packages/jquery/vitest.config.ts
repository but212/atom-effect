import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const SRC_PATH = `${import.meta.dirname}/src`;

export default defineConfig({
  resolve: {
    alias: {
      '@': SRC_PATH,
    },
  },
  test: {
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.config.ts',
        '__benchmarks__/**',
        '**/*.test.ts',
        '__tests__/**',
        'src/types/**',
        'src/types.ts',
      ],
    },
  },
});
