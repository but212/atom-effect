import { defineViteConfig } from '@but212/atom-effect-configs';

const target = process.env.BUILD_TARGET;
const isTypes = target === 'types';
const isBundle = target === 'bundle';
const isLib = target === 'lib';

export default defineViteConfig(
  {
    packageDir: import.meta.dirname,
    name: 'AtomEffectUtils',
    libFileNames: isBundle
      ? { umd: 'atom-effect-utils.min.js' }
      : { es: 'index.mjs', cjs: 'index.cjs' },
    formats: isBundle ? ['umd'] : isLib ? ['es', 'cjs'] : ['es'],
    emptyOutDir: isTypes,
    skipDts: !isTypes,
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
