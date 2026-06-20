/**
 * @module configs
 *
 * Responsibility:
 * Provides base configurations and merging utilities for Vite, Vitest, and benchmark tools
 * across the monorepo packages.
 *
 * Design Intent:
 * Standardizes building, testing, and benchmarking setups while allowing packages to
 * override settings as needed. Supports programmatic overrides for testing build configurations.
 */

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
 * Converts a PascalCase or camelCase string to kebab-case.
 *
 * When to use:
 * - Recommended for mapping library package names to standardized minified bundle filenames.
 *
 * @param str - The target string to convert.
 * @returns The converted kebab-case string.
 *
 * @example
 * const kebab = toKebabCase('AtomEffectJQuery');
 * // => 'atom-effect-jquery'
 */
export const toKebabCase = (str: string): string =>
  str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

/**
 * Generates resolve-alias configuration for a package directory.
 *
 * When to use:
 * - Recommended for aligning absolute path aliases (`@/`) to the target package's source directory.
 *
 * @param packageDir - The absolute path of the package directory.
 * @returns The resolver alias configuration object.
 *
 * @example
 * const resolve = getResolveConfig('/absolute/path/to/package');
 * // => { alias: { '@': '/absolute/path/to/package/src' } }
 */
export const getResolveConfig = (packageDir: string) => ({
  alias: {
    '@': `${packageDir.replace(/\\/g, '/')}/src`,
  },
});

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
   * @defaultValue derived from build target
   */
  formats?: LibraryFormats[];
  /**
   * Whether to empty the output directory before building.
   * @defaultValue derived from build target
   */
  emptyOutDir?: boolean;
  /**
   * Whether to skip generating TypeScript declaration files.
   * @defaultValue derived from build target
   */
  skipDts?: boolean;
  /**
   * Build target override.
   * @defaultValue `process.env.BUILD_TARGET`
   * @remarks
   * Setting this option allows configuring build targets programmatically, bypassing global env variables.
   */
  buildTarget?: string;
}

/**
 * The build target derived from the `BUILD_TARGET` environment variable.
 */
export let target = process.env.BUILD_TARGET;

const updateTarget = (val: string | undefined) => {
  target = val;
  isTypes = val === 'types';
  isBundle = val === 'bundle';
  isLib = val === 'lib';
};

if (typeof process === 'object' && process !== null) {
  const originalEnv = process.env;
  const envProxy = new Proxy(originalEnv, {
    get(t, prop) {
      return t[prop as string];
    },
    set(t, prop, value) {
      t[prop as string] = value;
      if (prop === 'BUILD_TARGET') {
        updateTarget(value);
      }
      return true;
    },
  });

  Object.defineProperty(process, 'env', {
    get() {
      return envProxy;
    },
    configurable: true,
    enumerable: true,
  });
}

/**
 * Tracks if the build target is 'types' (only TypeScript declarations).
 */
export let isTypes = target === 'types';

/**
 * Tracks if the build target is 'bundle' (bundled UMD builds).
 */
export let isBundle = target === 'bundle';

/**
 * Tracks if the build target is 'lib' (esm/cjs library builds).
 */
export let isLib = target === 'lib';

/**
 * Generates a base Vite configuration for building libraries and bundles.
 *
 * When to use:
 * - Recommended for initializing standard library building settings for ES, CJS, and UMD formats.
 *
 * @param options - Configuration options containing packageDir, name, and target overrides.
 * @returns A Vite UserConfig object configured for library builds.
 *
 * @example
 * const config = getBaseViteConfig({
 *   packageDir: import.meta.dirname,
 *   name: 'MyPackage',
 * });
 */
export const getBaseViteConfig = (options: BaseViteConfigOptions): UserConfig => {
  const activeTarget = options.buildTarget ?? target;
  const targetIsTypes = activeTarget === 'types';
  const targetIsBundle = activeTarget === 'bundle';
  const targetIsLib = activeTarget === 'lib';

  const {
    packageDir,
    name,
    entry = `${packageDir}/src/index.ts`,
    libFileNames,
    dtsOptions,
    formats = targetIsBundle ? ['umd'] : targetIsLib ? ['es', 'cjs'] : ['es'],
    emptyOutDir = targetIsTypes,
    skipDts = !targetIsTypes,
  } = options;

  const kebabName = toKebabCase(name);

  return {
    resolve: getResolveConfig(packageDir),
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
        fileName: (format: string) =>
          libFileNames?.[format] ??
          (format === 'umd' ? `${kebabName}.min.js` : `index.${format === 'es' ? 'mjs' : format}`),
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
            tsconfigPath: `${packageDir}/tsconfig.build.json`,
            bundleTypes: true,
            ...dtsOptions,
          }),
        ],
  };
};

/**
 * Defines a Vite configuration by merging a base configuration with user-provided overrides.
 *
 * When to use:
 * - Recommended for creating customized package-level `vite.config.ts` files in the monorepo.
 *
 * @param baseOptions - Options for creating the base Vite configuration.
 * @param overrides - Partial Vite configuration overrides to apply.
 * @returns A Vite UserConfig configuration function/object.
 *
 * @example
 * export default defineViteConfig(
 *   { packageDir: import.meta.dirname, name: 'MyPkg' },
 *   { build: { sourcemap: false } }
 * );
 */
export const defineViteConfig = (
  baseOptions: BaseViteConfigOptions,
  overrides: Partial<UserConfig> = {}
) => defineVite(() => mergeConfig(getBaseViteConfig(baseOptions), overrides));

/**
 * Base coverage exclusion patterns for Vitest.
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
 * Generates a base Vitest configuration with standard coverage and alias settings.
 *
 * When to use:
 * - Recommended for establishing basic test environments and coverage settings in a package.
 *
 * @param packageDir - The absolute path of the package directory.
 * @returns A Vitest config configuration object.
 *
 * @example
 * const config = getBaseVitestConfig(import.meta.dirname);
 */
export const getBaseVitestConfig = (packageDir: string): ViteUserConfig => ({
  resolve: getResolveConfig(packageDir),
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
 * Defines a Vitest configuration by merging a base configuration with user-provided overrides.
 *
 * When to use:
 * - Recommended for package-level `vitest.config.ts` files in the monorepo.
 *
 * @param packageDir - The absolute path of the package directory.
 * @param overrides - Partial Vitest configuration overrides to apply.
 * @returns A Vitest config configuration function/object.
 *
 * @example
 * export default defineVitestConfig(import.meta.dirname, {
 *   test: { environment: 'jsdom' }
 * });
 */
export const defineVitestConfig = (packageDir: string, overrides: ViteUserConfig = {}) =>
  defineVitest(() => mergeConfig(getBaseVitestConfig(packageDir), overrides));

/**
 * Generates a base Vitest benchmark configuration.
 *
 * When to use:
 * - Recommended for setting up standard benchmarking targets in a package.
 *
 * @param packageDir - The absolute path of the package directory.
 * @returns A Vitest benchmark configuration object.
 *
 * @example
 * const config = getBaseVitestBenchConfig(import.meta.dirname);
 */
export const getBaseVitestBenchConfig = (packageDir: string): ViteUserConfig => ({
  resolve: getResolveConfig(packageDir),
  test: {
    benchmark: {
      include: ['__benchmarks__/**/*.bench.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  },
});

/**
 * Defines a Vitest benchmark configuration by merging a base configuration with user-provided overrides.
 *
 * When to use:
 * - Recommended for package-level `vitest.bench.config.ts` files in the monorepo.
 *
 * @param packageDir - The absolute path of the package directory.
 * @param overrides - Partial Vitest benchmark configuration overrides to apply.
 * @returns A Vitest benchmark config configuration function/object.
 *
 * @example
 * export default defineVitestBenchConfig(import.meta.dirname, {
 *   test: { benchmark: { include: ['tests/*.bench.ts'] } }
 * });
 */
export const defineVitestBenchConfig = (packageDir: string, overrides: ViteUserConfig = {}) =>
  defineVitest(() => mergeConfig(getBaseVitestBenchConfig(packageDir), overrides));
