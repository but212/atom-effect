import type { PluginOptions } from 'unplugin-dts';
import dts from 'unplugin-dts/vite';
import { defineConfig, type LibraryFormats, mergeConfig, type UserConfig } from 'vite';

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
    build: {
      target: 'es2021',
      sourcemap: true,
      outDir: 'dist',
      emptyOutDir,
      minify: 'esbuild',
      lib: {
        entry,
        name,
        formats,
        ...(libFileNames
          ? {
              fileName: (format: string) =>
                libFileNames[format] ??
                `index.${format === 'es' ? 'mjs' : format === 'umd' ? 'js' : 'cjs'}`,
            }
          : {}),
      },
      rollupOptions: {
        output: {
          exports: 'named',
        },
      },
    },
    resolve: {
      alias: {
        '@': `${packageDir}/src`,
      },
    },
    plugins: [
      !skipDts &&
        dts({
          include: ['src/**/*'],
          exclude: ['src/**/*.test.ts', '__tests__/**/*', '__benchmarks__/**/*', 'node_modules'],
          tsconfigPath: './tsconfig.build.json',
          bundleTypes: true,
          ...dtsOptions,
        }),
    ].filter(Boolean),
  };
};

export const defineViteConfig = (
  baseOptions: BaseViteConfigOptions,
  overrides: Partial<UserConfig> = {}
) => defineConfig(() => mergeConfig(getBaseViteConfig(baseOptions), overrides));
