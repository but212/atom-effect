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

/**
 * Base tsup configuration options for building libraries and bundles.
 *
 * @remarks This configuration is designed to be used as a starting point for building libraries and bundles with tsup. It includes common settings such as output formats, declaration file generation, cleaning the output directory, and source map generation. You can extend or override these options in your specific tsup configuration as needed.
 */
export const baseTsupConfig: TsupOptions = {
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
};

/**
 * Base Vite configuration options for building libraries and bundles.
 */
export interface BaseViteConfigOptions {
  /** The directory of the package being built. */
  packageDir: string;
  /** The global variable name for UMD builds. */
  name: string;
  /**
   * The entry file for the library.
   * @defaultValue `${packageDir}/src/index.ts`
   */
  entry?: string;
  /** Custom file names for different formats (e.g., { es: 'index.mjs', cjs: 'index.cjs' }). */
  libFileNames?: Record<string, string>;
  /** Options for the unplugin-dts plugin. */
  dtsOptions?: PluginOptions;
  /**
   * Library formats to build.
   * @defaultValue `['umd']` for bundle, `['es', 'cjs']` for lib, `['es']` otherwise
   */
  formats?: LibraryFormats[];
  /**
   * Whether to empty the output directory before building.
   * @defaultValue `true` for types, `false` otherwise
   */
  emptyOutDir?: boolean;
  /**
   * Whether to skip generating TypeScript declaration files.
   * @defaultValue `true` unless building types
   */
  skipDts?: boolean;
}

/**
 * Build target environment variables and helper constants.
 * @remarks These constants are used to determine the build target (types, bundle, or lib) based on the BUILD_TARGET environment variable. They can be used in configuration files to conditionally apply settings based on the build target.
 */
export const target = process.env.BUILD_TARGET;

/**
 * True if the build target is 'types', indicating that only TypeScript declaration files should be generated.
 */
export const isTypes = target === 'types';
/**
 * True if the build target is 'bundle', indicating that a bundled UMD build should be generated.
 */
export const isBundle = target === 'bundle';
/**
 * True if the build target is 'lib', indicating that library builds (ESM and CJS) should be generated.
 */
export const isLib = target === 'lib';

/**
 * Generates a base Vite configuration for building libraries and bundles.
 * @param options - The options for configuring the base Vite configuration, including package directory, library name, entry file, custom file names, dts plugin options, output formats, and settings for emptying the output directory and skipping declaration file generation.
 * @returns A Vite UserConfig object configured for building libraries and bundles based on the provided options and the build target environment.
 * @remarks This function is designed to be used with the `defineViteConfig` helper for easy configuration of Vite builds. It sets up common configurations such as output formats, file naming conventions, source map generation, and plugin configuration for TypeScript declaration file generation based on the build target.
 */
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

/**
 * Defines a Vite configuration for building libraries and bundles by merging a base configuration with user-provided overrides.
 * @param baseOptions - The base options for generating the Vite configuration, including package directory, library name, entry file, custom file names, dts plugin options, output formats, and settings for emptying the output directory and skipping declaration file generation.
 * @param overrides - Partial user configuration to override or extend the base Vite configuration.
 * @returns A Vite UserConfig object that merges the base configuration with the provided overrides, suitable for building libraries and bundles based on the specified options and build target environment.
 * @remarks This function uses Vite's `mergeConfig` utility to combine the base configuration generated by `getBaseViteConfig` with any user-provided overrides, allowing for flexible and customizable Vite configurations for different packages and build targets.
 */
export const defineViteConfig = (
  baseOptions: BaseViteConfigOptions,
  overrides: Partial<UserConfig> = {}
) => defineVite(() => mergeConfig(getBaseViteConfig(baseOptions), overrides));

/**
 * Base coverage exclusion patterns for Vitest.
 *
 * @remarks This array defines common file patterns and directories that should be excluded from code coverage reports when using Vitest. It includes typical exclusions such as node_modules, distribution directories, configuration files, test files, and type definitions. You can modify this array to include additional patterns specific to your project as needed.
 */
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

/**
 * Generates a base Vitest configuration for testing with common settings and coverage exclusions.
 * @param packageDir - The directory of the package being tested, used for setting up path aliases.
 * @returns A Vite UserConfig object configured for Vitest testing, including path aliases and coverage settings.
 * @remarks This function provides a base configuration for Vitest that includes path aliasing for the package's source directory and sets up global testing with coverage reporting. The coverage configuration uses the V8 provider and includes text, JSON, and HTML reporters, while excluding common patterns defined in the `baseCoverageExclude` array. You can extend or override this configuration in your specific Vitest configuration as needed.
 */
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

/**
 * Defines a Vitest configuration for testing by merging a base configuration with user-provided overrides.
 * @param packageDir - The directory of the package being tested, used for setting up path aliases in the base configuration.
 * @param overrides - Partial user configuration to override or extend the base Vitest configuration.
 * @returns A Vite UserConfig object that merges the base Vitest configuration with the provided overrides, suitable for testing with Vitest based on the specified package directory and any additional settings.
 * @remarks This function uses Vite's `mergeConfig` utility to combine the base configuration generated by `getBaseVitestConfig` with any user-provided overrides, allowing for flexible and customizable Vitest configurations for different packages and testing needs.
 */
export const defineVitestConfig = (packageDir: string, overrides: ViteUserConfig = {}) =>
  defineVitest(() => mergeConfig(getBaseVitestConfig(packageDir), overrides) as ViteUserConfig);

/**
 * Generates a base Vitest benchmark configuration.
 * @param packageDir - The directory of the package being tested, used for setting up path aliases.
 * @returns A Vite UserConfig object configured for Vitest benchmarking.
 * @remarks This function provides a base configuration for Vitest benchmarks, including path aliasing for the package's source directory and setting up default include and exclude patterns for benchmark files.
 */
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

/**
 * Defines a Vitest benchmark configuration for testing by merging a base configuration with user-provided overrides.
 * @param packageDir - The directory of the package being tested, used for setting up path aliases in the base configuration.
 * @param overrides - Partial user configuration to override or extend the base Vitest benchmark configuration.
 * @returns A Vite UserConfig object that merges the base Vitest benchmark configuration with the provided overrides, suitable for benchmarking with Vitest based on the specified package directory and any additional settings.
 * @remarks This function uses Vite's `mergeConfig` utility to combine the base configuration generated by `getBaseVitestBenchConfig` with any user-provided overrides, allowing for flexible and customizable Vitest benchmark configurations for different packages and testing needs.
 */
export const defineVitestBenchConfig = (packageDir: string, overrides: ViteUserConfig = {}) =>
  defineVitest(
    () => mergeConfig(getBaseVitestBenchConfig(packageDir), overrides) as ViteUserConfig
  );
