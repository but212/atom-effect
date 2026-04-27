import { defineConfig, mergeConfig, type ViteUserConfig } from 'vitest/config';

export const getBaseVitestBenchConfig = (packageDir: string): ViteUserConfig => {
  return {
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
};

export const defineVitestBenchConfig =
  (packageDir: string) =>
  (overrides: ViteUserConfig = {}) =>
    defineConfig(() => mergeConfig(getBaseVitestBenchConfig(packageDir), overrides));
