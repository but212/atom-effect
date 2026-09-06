import { defineViteConfig } from '@but212/atom-effect-configs';

export default defineViteConfig(
  {
    packageDir: import.meta.dirname,
    name: 'AtomEffectJQuery',
  },
  ({ isBundle }) => ({
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
  })
);
