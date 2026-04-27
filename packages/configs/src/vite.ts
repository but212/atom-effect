import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import dts, { type PluginOptions } from 'vite-plugin-dts';

export interface BaseViteConfigOptions {
  packageDir: string;
  name: string;
  entry?: string;
  libFileName?: (format: string) => string;
  dtsOptions?: PluginOptions;
}

export const getBaseViteConfig = (options: BaseViteConfigOptions): UserConfig => {
  const {
    packageDir,
    name,
    entry = `${packageDir}/src/index.ts`,
    libFileName,
    dtsOptions,
  } = options;

  return {
    build: {
      target: 'es2021',
      sourcemap: true,
      outDir: 'dist',
      emptyOutDir: true,
      minify: 'esbuild',
      lib: {
        entry,
        name,
        formats: ['es', 'cjs', 'umd'],
        ...(libFileName ? { fileName: libFileName } : {}),
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
      dts({
        include: ['src/**/*'],
        exclude: ['src/**/*.test.ts', '__tests__/**/*', '__benchmarks__/**/*', 'node_modules'],
        tsconfigPath: './tsconfig.build.json',
        ...dtsOptions,
      }),
    ],
  };
};

export const defineViteConfig =
  (baseOptions: BaseViteConfigOptions) =>
  (overrides: Partial<UserConfig> = {}) =>
    defineConfig(() => mergeConfig(getBaseViteConfig(baseOptions), overrides));
