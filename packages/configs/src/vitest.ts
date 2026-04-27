import { mergeConfig, type ViteUserConfig } from 'vitest/config';

export const baseCoverageExclude = [
  'node_modules/**',
  'dist/**',
  '**/*.config.ts',
  '__benchmarks__/**',
  '**/*.test.ts',
  '__tests__/**',
  'src/types/**',
  'src/types.ts',
  'scripts/**',
];

export interface BaseVitestConfigOptions extends ViteUserConfig {}

export const createVitestConfig = (packageDir: string, options: BaseVitestConfigOptions = {}) => {
  const baseConfig: ViteUserConfig = {
    resolve: {
      alias: {
        '@': `${packageDir}/src`,
      },
    },
    test: {
      globals: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: baseCoverageExclude,
      },
    },
  };

  return mergeConfig(baseConfig, options);
};
