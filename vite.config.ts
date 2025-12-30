import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ReactiveAtom',
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
      formats: ['es', 'cjs'],
    },
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    target: 'es2021',
    rollupOptions: {
      external: [],
      output: {
        preserveModules: false,
        exports: 'named',
      },
    },
  },
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'node_modules'],
      insertTypesEntry: true,
    }),
  ],
});
