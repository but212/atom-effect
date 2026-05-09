import { defineViteConfig } from '@but212/atom-effect-configs';

export default defineViteConfig(
  {
    packageDir: import.meta.dirname,
    name: 'AtomEffectJQuery',
    libFileNames: {
      umd: 'atom-effect-jquery.min.js',
      es: 'index.mjs',
      cjs: 'index.cjs',
    },
  },
  {
    build: {
      rollupOptions: {
        external: ['jquery', '@but212/atom-effect'],
        output: {
          globals: {
            '@but212/atom-effect': 'AtomEffect',
            jquery: 'jQuery',
          },
        },
      },
    },
  }
);
