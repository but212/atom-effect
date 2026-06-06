import type { PluginOptions } from 'unplugin-dts';
import dts from 'unplugin-dts/vite';
import { defineConfig, type LibraryFormats, mergeConfig, type UserConfig } from 'vite';
import { getAliasConfig } from './shared';

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

const FORMAT_EXTENSIONS: Record<string, string> = {
  es: 'mjs',
  umd: 'js',
  cjs: 'cjs',
};

export const getBaseViteConfig = (options: BaseViteConfigOptions): UserConfig => {
  const {
    packageDir,
    name,
    entry = `${packageDir}/src/index.ts`,
    libFileNames,
    dtsOptions,
    formats = ['es', 'cjs', 'umd'],
    emptyOutDir = true,
    skipDts = false,
  } = options;

  return {
    ...getAliasConfig(packageDir),
    build: {
      target: 'ES2022',
      sourcemap: true,
      outDir: 'dist',
      emptyOutDir,
      minify: 'esbuild',
      lib: {
        entry,
        name,
        formats,
        fileName: (format) =>
          libFileNames?.[format] ?? `index.${FORMAT_EXTENSIONS[format] ?? format}`,
      },
      rollupOptions: {
        output: {
          exports: 'named',
        },
      },
    },
    plugins: skipDts
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
) => defineConfig(() => mergeConfig(getBaseViteConfig(baseOptions), overrides));
