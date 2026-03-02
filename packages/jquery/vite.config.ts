// vite.config.ts

import dts from 'vite-plugin-dts';
import tsconfigPaths from 'vite-tsconfig-paths';
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
      external: ['jquery', '@but212/atom-effect'],
      output: {
        globals: {
          jquery: 'jQuery',
          '@but212/atom-effect': 'AtomEffect',
        },
        exports: 'named',
      },
    },
    sourcemap: true,
  },
  plugins: [
    tsconfigPaths(),
    dts({ rollupTypes: true, exclude: ['src/**/*.test.ts', '__tests__/**/*'] }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
  },
});
