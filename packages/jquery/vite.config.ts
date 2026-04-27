import { createViteConfig } from '@but212/atom-effect-configs';

export default createViteConfig(import.meta.dirname, {
  name: 'AtomEffectJQuery',
  libFileName: (format: string) =>
    format === 'umd' ? 'atom-effect-jquery.min.js' : `index.${format === 'es' ? 'mjs' : 'cjs'}`,
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
});
