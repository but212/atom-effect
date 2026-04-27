import { createVitestBenchConfig } from '@but212/configs';

export default createVitestBenchConfig(import.meta.dirname, {
  test: {
    environment: 'node',
    benchmark: {
      outputFile: '.performance/results/benchmark-latest.json',
    },
  },
});
