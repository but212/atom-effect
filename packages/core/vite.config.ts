import { defineViteConfig } from '@but212/atom-effect-configs';

export default defineViteConfig(
  {
    packageDir: import.meta.dirname,
    name: 'AtomEffect',
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
