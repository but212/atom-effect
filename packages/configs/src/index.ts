import type { Options as TsupOptions } from 'tsup';
import type { PluginOptions } from 'unplugin-dts';
import dts from 'unplugin-dts/vite';
import {
  defineConfig as defineVite,
  type LibraryFormats,
  mergeConfig,
  type UserConfig,
} from 'vite';
import { defineConfig as defineVitest, type ViteUserConfig } from 'vitest/config';

export const baseTsupConfig: TsupOptions = {
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
};

export interface BaseViteConfigOptions {
  packageDir: string;
  name: string;
  entry?: string;
  libFileNames?: Record<string, string>;
  dtsOptions?: PluginOptions;
  formats?: LibraryFormats[];
  emptyOutDir?: boolean;
  skipDts?: boolean;
}

export const target = process.env.BUILD_TARGET;
export const isTypes = target === 'types';
export const isBundle = target === 'bundle';
export const isLib = target === 'lib';

export const getBaseViteConfig = (options: BaseViteConfigOptions): UserConfig => {
  const {
    packageDir,
    name,
    entry = `${packageDir}/src/index.ts`,
    libFileNames,
    dtsOptions,
    formats,
    emptyOutDir,
    skipDts,
  } = options;

  const kebabName = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const finalFormats = formats ?? (isBundle ? ['umd'] : isLib ? ['es', 'cjs'] : ['es']);
  const finalEmptyOutDir = emptyOutDir ?? isTypes;
  const finalSkipDts = skipDts ?? !isTypes;

  const formatExtensions: Record<string, string> = { es: 'mjs', cjs: 'cjs' };

  return {
    resolve: {
      alias: {
        '@': `${packageDir}/src`,
      },
    },
    build: {
      target: 'ES2022',
      sourcemap: true,
      outDir: 'dist',
      emptyOutDir: finalEmptyOutDir,
      minify: 'esbuild',
      lib: {
        entry,
        name,
        formats: finalFormats,
        fileName: (format) =>
          libFileNames?.[format] ??
          (format === 'umd'
            ? `${kebabName}.min.js`
            : `index.${formatExtensions[format] ?? format}`),
      },
      rollupOptions: {
        output: {
          exports: 'named',
        },
      },
    },
    plugins: finalSkipDts
      ? []
      : [
          dts({
            include: ['src/**/*'],
            exclude: ['src/**/*.test.ts', '__tests__/**/*', '__benchmarks__/**/*', 'node_modules'],
            tsconfigPath: './tsconfig.build.json',
            bundleTypes: true,
            ...dtsOptions,
          }),
        ],
  };
};

export const defineViteConfig = (
  baseOptions: BaseViteConfigOptions,
  overrides: Partial<UserConfig> = {}
) => defineVite(() => mergeConfig(getBaseViteConfig(baseOptions), overrides));

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

export const getBaseVitestConfig = (packageDir: string): ViteUserConfig => ({
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
});

export const defineVitestConfig = (packageDir: string, overrides: ViteUserConfig = {}) =>
  defineVitest(() => mergeConfig(getBaseVitestConfig(packageDir), overrides) as ViteUserConfig);

export const getBaseVitestBenchConfig = (packageDir: string): ViteUserConfig => ({
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
});

export const defineVitestBenchConfig = (packageDir: string, overrides: ViteUserConfig = {}) =>
  defineVitest(
    () => mergeConfig(getBaseVitestBenchConfig(packageDir), overrides) as ViteUserConfig
  );
