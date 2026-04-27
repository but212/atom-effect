import { mergeConfig, type ViteUserConfig } from 'vitest/config';

export const createVitestBenchConfig = (packageDir: string, options: ViteUserConfig = {}) => {
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
