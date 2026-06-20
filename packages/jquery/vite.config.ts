import { defineViteConfig, isBundleBuild } from '@but212/atom-effect-configs';

export default defineViteConfig(
  {
    packageDir: import.meta.dirname,
    name: 'AtomEffectJQuery',
  },
  {
    build: {
      rollupOptions: {
        external: isBundleBuild ? ['jquery'] : ['jquery', '@but212/atom-effect'],
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
