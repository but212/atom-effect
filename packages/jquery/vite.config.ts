// vite.config.ts

import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
  plugins: [dts({ rollupTypes: true, exclude: ['src/**/*.test.ts', '__tests__/**/*'] })],
  test: {
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
  },
});
