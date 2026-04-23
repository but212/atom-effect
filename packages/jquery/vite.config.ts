import { playwright } from '@vitest/browser-playwright';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  build: {
    target: 'es2021',
    lib: {
      entry: 'src/index.ts',
      name: 'AtomEffectJQuery',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format: string) =>
        format === 'umd' ? 'atom-effect-jquery.min.js' : `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['jquery'],
      output: {
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
    dts({
      rollupTypes: true,
      exclude: ['src/**/*.test.ts', '__tests__/**/*'],
    }),
  ],
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['./__tests__/setup.ts'],
  },
}));
