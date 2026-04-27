import { mergeConfig, type ViteUserConfig } from 'vitest/config';

export interface BaseVitestBenchConfigOptions extends ViteUserConfig {}

export const createVitestBenchConfig = (
  packageDir: string,
  options: BaseVitestBenchConfigOptions = {}
) => {
  const baseConfig: ViteUserConfig = {
    resolve: {
      alias: {
        '@': `${packageDir}/src`,
      },
    },
    test: {
      benchmark: {
        include: ['__benchmarks__/**/*.bench.ts'],
        exclude: ['**/node_modules/**', '**/dist/**'],
      },
    },
  };

  return mergeConfig(baseConfig, options);
};
