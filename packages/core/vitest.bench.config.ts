import { createVitestBenchConfig } from '@but212/atom-effect-configs';

export default createVitestBenchConfig(import.meta.dirname, {
  test: {
    environment: 'node',
    benchmark: {
      outputFile: '.performance/results/benchmark-latest.json',
    },
  },
});
