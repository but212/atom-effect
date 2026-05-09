import { defineViteConfig } from '@but212/atom-effect-configs';

export default defineViteConfig(
  {
    packageDir: import.meta.dirname,
    name: 'AtomEffect',
    libFileNames: {
      umd: 'atom-effect.min.js',
      es: 'index.mjs',
      cjs: 'index.cjs',
    },
    dtsOptions: {
      insertTypesEntry: true,
    },
  },
  {
    build: {
      rollupOptions: {
        output: {
          preserveModules: false,
        },
      },
    },
  }
);
