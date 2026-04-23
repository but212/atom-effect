import path from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const SRC_PATH = path.resolve(__dirname, 'src');

export default defineConfig({
  resolve: {
    alias: {
      '@': SRC_PATH,
    },
  },
  test: {
    globals: true,
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
        'scripts/**',
      ],
    },
    projects: [
      {
        resolve: {
          alias: {
            '@': SRC_PATH,
          },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['__tests__/dom/**', '**/*.dom.test.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '@': SRC_PATH,
          },
        },
        test: {
          name: 'dom',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          include: ['__tests__/dom/**/*.test.ts', '**/*.dom.test.ts'],
        },
      },
    ],
  },
});
