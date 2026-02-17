import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __DEV__: 'false',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AtomEffect',
      fileName: (format) => {
        if (format === 'umd') return 'atom-effect.min.js';
        return `index.${format === 'es' ? 'mjs' : 'cjs'}`;
      },
      formats: ['es', 'cjs', 'umd'],
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
    tsconfigPaths(),
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'node_modules'],
      insertTypesEntry: true,
      rollupTypes: true,
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
});
