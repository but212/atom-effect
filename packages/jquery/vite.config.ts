import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  build: {
    target: 'es2021',
    lib: {
      entry: `${import.meta.dirname}/src/index.ts`,
      name: 'AtomEffectJQuery',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format: string) =>
        format === 'umd' ? 'atom-effect-jquery.min.js' : `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['jquery', '@but212/atom-effect'],
      output: {
        globals: {
          '@but212/atom-effect': 'AtomEffect',
          jquery: 'jQuery',
        },
        exports: 'named',
      },
    },
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', '__tests__/**/*', '__benchmarks__/**/*', 'node_modules'],
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
}));
