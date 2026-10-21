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
import dts from 'unplugin-dts/vite';
import { defineConfig as defineVite, mergeConfig } from 'vite';
import { defineConfig as defineVitest } from 'vitest/config';

/**
 * @typedef {object} BaseViteConfigOptions
 * @property {string} packageDir Absolute path of the package directory.
 * @property {string} name UMD global name; also derives the bundle file name.
 * @property {string} [entry] Library entry (default: `<packageDir>/src/index.ts`).
 * @property {Record<string, string>} [libFileNames] Per-format output file name overrides.
 * @property {import('unplugin-dts').PluginOptions} [dtsOptions] Extra options for the dts plugin.
 * @property {import('vite').LibraryFormats[]} [formats] Output formats (default depends on target).
 * @property {boolean} [emptyOutDir] Whether to empty `dist` before building.
 * @property {boolean} [skipDts] Whether to skip declaration generation.
 * @property {string} [buildTarget] `types` | `lib` | `bundle`; falls back to `BUILD_TARGET`.
 */

/**
 * @typedef {object} BuildEnv
 * @property {boolean} isBundle
 * @property {boolean} isLib
 * @property {boolean} isTypes
 */

/** @typedef {import('vite').UserConfig} UserConfig */
/** @typedef {import('vitest/config').ViteUserConfig} ViteUserConfig */
/**
 * Converts a PascalCase or camelCase string to kebab-case.
 *
 * When to use:
 * - Recommended for mapping library package names to standardized minified bundle filenames.
 *
 * @param {string} targetString The target string to convert.
 * @returns {string} The converted kebab-case string.
 *
 * @example
 * const kebab = toKebabCase('AtomEffectJQuery');
 * // => 'atom-effect-jquery'
 */
export const toKebabCase = (targetString) =>
  targetString
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
/**
 * Generates resolve-alias configuration for a package directory.
 *
 * When to use:
 * - Recommended for aligning absolute path aliases (`@/`) to the target package's source directory.
 *
 * @param {string} packageDir The absolute path of the package directory.
 * @returns {{ alias: Record<string, string> }} The resolver alias configuration object.
 *
 * @example
 * const resolve = getResolveConfig('/absolute/path/to/package');
 * // => { alias: { '@': '/absolute/path/to/package/src' } }
 */
export const getResolveConfig = (packageDir) => ({
  alias: {
    '@': `${packageDir.replace(/\\/g, '/')}/src`,
  },
});
/**
 * Generates a base Vite configuration for building libraries and bundles.
 *
 * When to use:
 * - Recommended for initializing standard library building settings for ES, CJS, and UMD formats.
 *
 * @param {BaseViteConfigOptions} options Configuration options containing packageDir, name, and target overrides.
 * @returns {UserConfig} A Vite UserConfig object configured for library builds.
 *
 * @example
 * const config = getBaseViteConfig({
 *   packageDir: import.meta.dirname,
 *   name: 'MyPackage',
 * });
 */
export const getBaseViteConfig = (options) => {
  const activeTarget = options.buildTarget ?? process.env.BUILD_TARGET;
  const isTargetTypes = activeTarget === 'types';
  const isTargetBundle = activeTarget === 'bundle';
  const isTargetLibrary = activeTarget === 'lib';
  const {
    packageDir,
    name,
    entry = `${packageDir}/src/index.ts`,
    libFileNames,
    dtsOptions,
    formats = isTargetBundle ? ['umd'] : isTargetLibrary ? ['es', 'cjs'] : ['es'],
    emptyOutDir = isTargetTypes,
    skipDts = !isTargetTypes,
  } = options;
  const kebabCaseName = toKebabCase(name);
  return {
    resolve: getResolveConfig(packageDir),
    build: {
      target: 'ES2022',
      sourcemap: true,
      outDir: 'dist',
      emptyOutDir,
      minify: 'oxc',
      lib: {
        entry,
        name,
        formats,
        fileName: (format) =>
          libFileNames?.[format] ??
          (format === 'umd'
            ? `${kebabCaseName}.min.js`
            : `index.${format === 'es' ? 'mjs' : format}`),
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
            bundleTypes: false,
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
 * @param {BaseViteConfigOptions} baseOptions Options for creating the base Vite configuration.
 * @param {Partial<UserConfig> | ((env: BuildEnv) => Partial<UserConfig>)} [overrides] Partial Vite configuration overrides or an override factory function to apply.
 * @returns A Vite UserConfig configuration function/object.
 *
 * @example
 * export default defineViteConfig(
 *   { packageDir: import.meta.dirname, name: 'MyPkg' },
 *   { build: { sourcemap: false } }
 * );
 */
export const defineViteConfig = (baseOptions, overrides = {}) =>
  defineVite(() => {
    const activeTarget = baseOptions.buildTarget ?? process.env.BUILD_TARGET;
    const env = {
      isBundle: activeTarget === 'bundle',
      isLib: activeTarget === 'lib',
      isTypes: activeTarget === 'types',
    };
    const resolvedOverrides = typeof overrides === 'function' ? overrides(env) : overrides;
    return mergeConfig(getBaseViteConfig(baseOptions), resolvedOverrides);
  });
/**
 * Base coverage exclusion patterns for Vitest.
 */
export const baseCoverageExclusionPatterns = [
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
 * @param {string} packageDir The absolute path of the package directory.
 * @returns {ViteUserConfig} A Vitest config configuration object.
 *
 * @example
 * const config = getBaseVitestConfig(import.meta.dirname);
 */
export const getBaseVitestConfig = (packageDir) => ({
  resolve: getResolveConfig(packageDir),
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: baseCoverageExclusionPatterns,
    },
  },
});
/**
 * Defines a Vitest configuration by merging a base configuration with user-provided overrides.
 *
 * When to use:
 * - Recommended for package-level `vitest.config.ts` files in the monorepo.
 *
 * @param {string} packageDir The absolute path of the package directory.
 * @param {ViteUserConfig} [overrides] Partial Vitest configuration overrides to apply.
 * @returns A Vitest config configuration function/object.
 *
 * @example
 * export default defineVitestConfig(import.meta.dirname, {
 *   test: { environment: 'jsdom' }
 * });
 */
export const defineVitestConfig = (packageDir, overrides = {}) =>
  defineVitest(() => mergeConfig(getBaseVitestConfig(packageDir), overrides));
/**
 * Generates a base Vitest benchmark configuration.
 *
 * When to use:
 * - Recommended for setting up standard benchmarking targets in a package.
 *
 * @param {string} packageDir The absolute path of the package directory.
 * @returns {ViteUserConfig} A Vitest benchmark configuration object.
 *
 * @example
 * const config = getBaseVitestBenchmarkConfig(import.meta.dirname);
 */
export const getBaseVitestBenchmarkConfig = (packageDir) => ({
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
 * @param {string} packageDir The absolute path of the package directory.
 * @param {ViteUserConfig} [overrides] Partial Vitest benchmark configuration overrides to apply.
 * @returns A Vitest benchmark config configuration function/object.
 *
 * @example
 * export default defineVitestBenchConfig(import.meta.dirname, {
 *   test: { benchmark: { include: ['tests/*.bench.ts'] } }
 * });
 */
export const defineVitestBenchConfig = (packageDir, overrides = {}) =>
  defineVitest(() => {
    const mergedConfig = mergeConfig(getBaseVitestBenchmarkConfig(packageDir), overrides);
    // Reason: Vite's mergeConfig automatically concatenates arrays. We must explicitly override
    // the benchmark include array if the user provided customized patterns to avoid array union duplicates.
    const customIncludePatterns = overrides.test?.benchmark?.include;
    if (customIncludePatterns && mergedConfig.test?.benchmark) {
      mergedConfig.test.benchmark.include = customIncludePatterns;
    }
    return mergedConfig;
  });
