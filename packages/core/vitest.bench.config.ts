import { defineVitestBenchConfig } from '@but212/atom-effect-configs';

export default defineVitestBenchConfig(import.meta.dirname)({
  test: {
    environment: 'node',
    benchmark: {
      outputFile: '.performance/results/benchmark-latest.json',
    },
  },
});
