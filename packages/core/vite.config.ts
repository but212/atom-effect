import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * Vite Configuration: Atom-Effect Core
 * 
 * Orchestrates the build process for the core reactive engine, producing 
 * cross-environment bundles (ESM, CJS, UMD) and unified type definitions.
 */
export default defineConfig(({ mode }) => ({
  /** 
   * Logic: Environment Injection
   * Injects the current build mode into the bundle to allow for runtime 
   * branching (e.g., stripping development diagnostics in production).
   */
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AtomEffect',
      /**
       * Logic: Format-Specific Naming
       * - UMD: Optimized for CDN usage with a standard .min.js suffix.
       * - ESM/CJS: Uses standard extensions for modern and legacy Node.js resolution.
       */
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
        /** 
         * Logic: Bundling Strategy
         * Disables preserveModules to produce a single-file bundle for the 
         * core library, ensuring optimal load performance for CDN users.
         */
        preserveModules: false,
        exports: 'named',
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    /**
     * Logic: Declaration Orchestration
     * Generates and bundles TypeScript declaration files.
     * 
     * Optimization: Unified Types
     * Uses rollupTypes to merge internal declarations into a single public 
     * d.ts file, providing a cleaner developer experience for consumers.
     */
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'node_modules'],
      insertTypesEntry: true,
      rollupTypes: true,
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
}));
