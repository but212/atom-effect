import path from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** Path to the library source root for alias resolution. */
const SRC_PATH = path.resolve(__dirname, 'src');

/**
 * Vitest Configuration: Core Engine
 * 
 * Orchestrates the comprehensive testing suite for the core reactive engine. 
 * Splits testing into isolated projects to handle both pure logic (Node.js) 
 * and browser-specific DOM interactions (Playwright) efficiently.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': SRC_PATH,
    },
  },
  test: {
    globals: true,
    /**
     * Logic: Coverage Instrumentation
     * Configures V8-based coverage reporting, excluding build artifacts, 
     * configuration files, and type definitions to ensure metrics focus on 
     * executable logic.
     */
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
      /**
       * Logic: Unit Test Project
       * Executes pure logic tests in a high-performance Node.js environment. 
       * Excludes DOM-dependent tests to maintain fast execution cycles.
       */
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
      /**
       * Logic: DOM/Browser Test Project
       * Uses Playwright to execute tests in a real Chromium instance, ensuring 
       * the core reactive logic interacts correctly with actual DOM APIs.
       */
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
