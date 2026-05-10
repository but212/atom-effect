import { defineViteConfig } from '@but212/atom-effect-configs';

const target = process.env.BUILD_TARGET;
const isTypes = target === 'types';
const isBundle = target === 'bundle';
const isLib = target === 'lib';

export default defineViteConfig(
  {
    packageDir: import.meta.dirname,
    name: 'AtomEffectJQuery',
    libFileNames: isBundle
      ? { umd: 'atom-effect-jquery.min.js' }
      : { es: 'index.mjs', cjs: 'index.cjs' },
    formats: isBundle ? ['umd'] : isLib ? ['es', 'cjs'] : ['es'],
    emptyOutDir: isTypes,
    skipDts: !isTypes,
  },
  {
    build: {
      rollupOptions: {
        external: isBundle ? ['jquery'] : ['jquery', '@but212/atom-effect'],
        output: {
          globals: {
            jquery: 'jQuery',
            '@but212/atom-effect': 'AtomEffect',
          },
        },
      },
    },
  }
);
