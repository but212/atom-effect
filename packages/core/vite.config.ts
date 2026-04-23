import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  build: {
    lib: {
      entry: `${import.meta.dirname}/src/index.ts`,
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
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'node_modules'],
      insertTypesEntry: true,
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
}));
