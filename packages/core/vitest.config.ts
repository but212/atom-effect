import { defineVitestConfig } from '@but212/atom-effect-configs';
import { playwright } from '@vitest/browser-playwright';

const packageDir = import.meta.dirname;
const SRC_PATH = `${packageDir}/src`;

export default defineVitestConfig(packageDir, {
  test: {
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
