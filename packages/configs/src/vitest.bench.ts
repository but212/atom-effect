import { defineConfig, mergeConfig, type ViteUserConfig } from 'vitest/config';
import { getAliasConfig } from './shared';

export const getBaseVitestBenchConfig = (packageDir: string): ViteUserConfig => ({
  ...getAliasConfig(packageDir),
  test: {
    benchmark: {
      include: ['__benchmarks__/**/*.bench.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  },
});

export const defineVitestBenchConfig = (packageDir: string, overrides: ViteUserConfig = {}) =>
  defineConfig(() => mergeConfig(getBaseVitestBenchConfig(packageDir), overrides));
