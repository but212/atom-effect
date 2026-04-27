import { defineConfig, mergeConfig, type UserConfig } from 'vite';
import dts, { type PluginOptions } from 'vite-plugin-dts';

export interface BaseViteConfigOptions extends Partial<UserConfig> {
  name: string;
  libFileName?: (format: string) => string;
  dtsOptions?: PluginOptions;
}

export const createViteConfig = (packageDir: string, options: BaseViteConfigOptions) => {
  const { name, libFileName, dtsOptions, ...rest } = options;

  return defineConfig(({ mode }) => {
    const baseConfig: UserConfig = {
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
      },
      build: {
        target: 'es2021',
        sourcemap: true,
        outDir: 'dist',
        emptyOutDir: true,
        minify: 'esbuild',
        lib: {
          entry: `${packageDir}/src/index.ts`,
          name: name,
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

    return mergeConfig(baseConfig, rest);
  });
};
