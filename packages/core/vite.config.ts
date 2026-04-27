import { createViteConfig } from '@but212/configs';

export default createViteConfig(import.meta.dirname, {
  name: 'AtomEffect',
  libFileName: (format: string) => {
    if (format === 'umd') return 'atom-effect.min.js';
    return `index.${format === 'es' ? 'mjs' : 'cjs'}`;
  },
  dtsOptions: {
    insertTypesEntry: true,
  },
  build: {
    rollupOptions: {
      output: {
        preserveModules: false,
      },
    },
  },
});
