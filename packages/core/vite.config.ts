import { defineViteConfig } from '@but212/atom-effect-configs';

export default defineViteConfig({
  packageDir: import.meta.dirname,
  name: 'AtomEffect',
  libFileName: (format: string) => {
    if (format === 'umd') return 'atom-effect.min.js';
    return `index.${format === 'es' ? 'mjs' : 'cjs'}`;
  },
  dtsOptions: {
    insertTypesEntry: true,
  },
})({
  build: {
    rollupOptions: {
      output: {
        preserveModules: false,
      },
    },
  },
});
