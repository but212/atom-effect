import { defineVitestBenchConfig } from '@but212/atom-effect-configs';

export default defineVitestBenchConfig(import.meta.dirname, {
  test: {
    environment: 'node',
    reporters: ['verbose'],
  },
});
