import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AtomEffect',
      fileName: (format: string) => {
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
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'node_modules'],
      insertTypesEntry: true,
      skipDiagnostics: true,
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
}));
