import { defineViteConfig } from '@but212/atom-effect-configs';

export default defineViteConfig(
  {
    packageDir: import.meta.dirname,
    name: 'AtomEffectUtils',
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
