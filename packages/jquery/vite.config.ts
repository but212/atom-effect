import { playwright } from '@vitest/browser-playwright';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

/**
 * Vite Configuration: Atom-Effect jQuery Integration
 *
 * Orchestrates the build and testing pipeline for the jQuery-based reactive
 * bindings. This configuration manages peer dependency externalization,
 * cross-format bundling (ESM, CJS, UMD), and browser-based quality assurance.
 */
export default defineConfig(({ mode }) => ({
  /**
   * Logic: Environment Injection
   * Synchronizes the build mode with the runtime environment to enable
   * conditional logic (e.g., stripping debug instrumentation in production).
   */
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  build: {
    target: 'es2021',
    lib: {
      entry: 'src/index.ts',
      name: 'AtomEffectJQuery',
      formats: ['es', 'cjs', 'umd'],
      /**
       * Logic: Format-Specific Naming
       * Standardizes output filenames for CDN and Node.js environments.
       */
      fileName: (format: string) =>
        format === 'umd' ? 'atom-effect-jquery.min.js' : `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      /**
       * Constraint: Peer Dependency Externalization
       * jQuery must be provided by the consumer to avoid duplicate instances
       * and version conflicts within the host application.
       */
      external: ['jquery'],
      output: {
        /**
         * Reason: UMD Global Mapping
         * Maps the external 'jquery' dependency to the standard 'jQuery' global
         * variable for use in script-tag based environments.
         */
        globals: {
          jquery: 'jQuery',
        },
        exports: 'named',
      },
    },
    sourcemap: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    /**
     * Optimization: Unified Type Declarations
     * Flattens and bundles internal type definitions into a single public
     * declaration file to simplify consumption by TypeScript users.
     */
    dts({
      rollupTypes: true,
      exclude: ['src/**/*.test.ts', '__tests__/**/*'],
    }),
  ],
  test: {
    /**
     * Logic: Browser-Based Validation
     * Uses Playwright to execute tests in a real Chromium instance. This is
     * mandatory for validating reactive bindings that rely on actual DOM
     * behaviors and jQuery's internal event orchestration.
     */
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['./__tests__/setup.ts'],
  },
}));
