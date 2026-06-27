import type { LibraryOptions, UserConfig } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';

const { mockDts } = vi.hoisted(() => {
  return { mockDts: vi.fn().mockReturnValue({ name: 'unplugin-dts' }) };
});

vi.mock('unplugin-dts/vite', () => ({
  default: mockDts,
}));

import {
  activeBuildTarget,
  baseCoverageExclusionPatterns,
  defineViteConfig,
  defineVitestBenchConfig,
  defineVitestConfig,
  getBaseViteConfig,
  getBaseVitestBenchmarkConfig,
  getBaseVitestConfig,
  getResolveConfig,
  isBundleBuild,
  isLibraryBuild,
  isTypesBuild,
  toKebabCase,
} from '../src/index';

type ConfigFn<T> = () => T | Promise<T>;

const TEST_DIR = '/test/dir';
const TEST_PKG = 'TestPackage';
const TEST_KEBAB = 'test-package';

describe('packages/configs', () => {
  describe('utility helpers', () => {
    describe('toKebabCase', () => {
      it.each([
        ['MyLibrary', 'my-library'],
        ['someCoolName', 'some-cool-name'],
        ['already-kebab', 'already-kebab'],
        ['lowercase', 'lowercase'],
        ['APIClient', 'api-client'],
        ['MyJSONParser', 'my-json-parser'],
      ])('should convert "%s" to "%s"', (input, expected) => {
        expect(toKebabCase(input)).toBe(expected);
      });
    });

    describe('getResolveConfig', () => {
      it('should generate resolve alias config pointing to package src', () => {
        expect(getResolveConfig(TEST_DIR)).toEqual({
          alias: {
            '@': `${TEST_DIR}/src`,
          },
        });
      });

      it('should normalize path separators to forward slashes on Windows', () => {
        const winPath = 'C:\\Users\\redog\\project\\atom-effect';
        const config = getResolveConfig(winPath);
        expect(config.alias['@']).toBe('C:/Users/redog/project/atom-effect/src');
      });
    });
  });

  describe('vite config helpers', () => {
    describe('getBaseViteConfig', () => {
      it('should generate configuration with default parameters', () => {
        const config = getBaseViteConfig({
          packageDir: TEST_DIR,
          name: TEST_PKG,
        });

        expect(config.resolve?.alias).toEqual({ '@': `${TEST_DIR}/src` });
        expect(config.build?.target).toBe('ES2022');
        expect(config.build?.sourcemap).toBe(true);
        expect(config.build?.outDir).toBe('dist');

        const lib = config.build?.lib;
        expect(lib).toBeTypeOf('object');
        if (lib && typeof lib === 'object') {
          expect(lib.entry).toBe(`${TEST_DIR}/src/index.ts`);
          expect(lib.name).toBe(TEST_PKG);
          expect(lib.formats).toEqual(['es']);
        }
      });

      it('should format filename using kebab-case for UMD builds', () => {
        const config = getBaseViteConfig({
          packageDir: TEST_DIR,
          name: TEST_PKG,
          formats: ['umd'],
        });

        const lib = config.build?.lib;
        expect(lib).toBeTypeOf('object');
        const fileNameFn = (lib as LibraryOptions)?.fileName as (
          format: string,
          entryName: string
        ) => string;
        expect(fileNameFn).toBeTypeOf('function');
        expect(fileNameFn('umd', 'index')).toBe(`${TEST_KEBAB}.min.js`);
        expect(fileNameFn?.('es', 'index')).toBe('index.mjs');
        expect(fileNameFn?.('cjs', 'index')).toBe('index.cjs');
      });

      it('should apply custom filename overrides if specified', () => {
        const config = getBaseViteConfig({
          packageDir: TEST_DIR,
          name: TEST_PKG,
          libFileNames: {
            es: 'custom.js',
          },
        });

        const lib = config.build?.lib;
        expect(lib).toBeTypeOf('object');
        const fileNameFn = (lib as LibraryOptions)?.fileName as (
          format: string,
          entryName: string
        ) => string;
        expect(fileNameFn).toBeTypeOf('function');
        expect(fileNameFn('es', 'index')).toBe('custom.js');
        expect(fileNameFn?.('umd', 'index')).toBe(`${TEST_KEBAB}.min.js`);
      });

      describe('buildTarget options', () => {
        it('should structure formats for bundle target', () => {
          const config = getBaseViteConfig({
            packageDir: TEST_DIR,
            name: TEST_PKG,
            buildTarget: 'bundle',
          });

          const lib = config.build?.lib;
          expect(lib).toBeTypeOf('object');
          expect((lib as LibraryOptions)?.formats).toEqual(['umd']);
        });

        it('should structure formats for lib target', () => {
          const config = getBaseViteConfig({
            packageDir: TEST_DIR,
            name: TEST_PKG,
            buildTarget: 'lib',
          });

          const lib = config.build?.lib;
          expect(lib).toBeTypeOf('object');
          expect((lib as LibraryOptions)?.formats).toEqual(['es', 'cjs']);
        });

        it('should configure settings for types target', () => {
          const config = getBaseViteConfig({
            packageDir: TEST_DIR,
            name: TEST_PKG,
            buildTarget: 'types',
          });
          expect(config.build?.emptyOutDir).toBe(true);
          expect(config.plugins).toHaveLength(1);
        });

        it('should resolve tsconfigPath relative to packageDir instead of hardcoding ./tsconfig.build.json', () => {
          mockDts.mockClear();
          getBaseViteConfig({
            packageDir: TEST_DIR,
            name: TEST_PKG,
            buildTarget: 'types',
          });
          expect(mockDts).toHaveBeenCalled();
          const callArgs = mockDts.mock.calls[0]?.[0];
          expect(callArgs).toBeDefined();
          expect(callArgs?.tsconfigPath).toBe(`${TEST_DIR}/tsconfig.build.json`);
        });
      });
    });

    describe('defineViteConfig', () => {
      it('should merge user overrides into the base configuration', async () => {
        const configFn = defineViteConfig(
          { packageDir: TEST_DIR, name: TEST_PKG },
          { build: { target: 'ES2020', minify: false } }
        );

        expect(typeof configFn).toBe('function');
        const config = await (configFn as ConfigFn<UserConfig>)();

        expect(config.build?.target).toBe('ES2020');
        expect(config.build?.minify).toBe(false);
        expect(config.resolve?.alias).toEqual({ '@': `${TEST_DIR}/src` });
      });
    });
  });

  describe('vitest config helpers', () => {
    describe('getBaseVitestConfig', () => {
      it('should generate base vitest config with default coverage options', () => {
        const config = getBaseVitestConfig(TEST_DIR);
        expect(config.resolve?.alias).toEqual({ '@': `${TEST_DIR}/src` });
        expect(config.test?.globals).toBe(true);
        expect(config.test?.coverage?.provider).toBe('v8');
        expect(config.test?.coverage?.exclude).toBe(baseCoverageExclusionPatterns);
      });
    });

    describe('defineVitestConfig', () => {
      it('should merge Vitest overrides successfully', async () => {
        const configFn = defineVitestConfig(TEST_DIR, {
          test: {
            environment: 'jsdom',
            globals: false,
          },
        });

        expect(typeof configFn).toBe('function');
        const config = await (configFn as ConfigFn<ViteUserConfig>)();

        expect(config.test?.environment).toBe('jsdom');
        expect(config.test?.globals).toBe(false);
        expect(config.resolve?.alias).toEqual({ '@': `${TEST_DIR}/src` });
      });
    });
  });

  describe('benchmark config helpers', () => {
    describe('getBaseVitestBenchConfig', () => {
      it('should generate base benchmarking configurations', () => {
        const config = getBaseVitestBenchmarkConfig(TEST_DIR);
        expect(config.resolve?.alias).toEqual({ '@': `${TEST_DIR}/src` });
        expect(config.test?.benchmark?.include).toEqual(['__benchmarks__/**/*.bench.ts']);
      });
    });

    describe('defineVitestBenchConfig', () => {
      it('should completely override the benchmark include array instead of concatenating it', async () => {
        const configFn = defineVitestBenchConfig(TEST_DIR, {
          test: {
            benchmark: {
              include: ['my-bench.ts'],
            },
          },
        });

        expect(typeof configFn).toBe('function');
        const config = await (configFn as ConfigFn<ViteUserConfig>)();
        expect(config.test?.benchmark?.include).toEqual(['my-bench.ts']);
      });

      it('should merge other Vitest benchmark configuration properties successfully', async () => {
        const configFn = defineVitestBenchConfig(TEST_DIR, {
          test: {
            benchmark: {
              exclude: ['**/custom-exclude/**'],
            },
          },
        });

        const config = await (configFn as ConfigFn<ViteUserConfig>)();
        expect(config.test?.benchmark?.include).toEqual(['__benchmarks__/**/*.bench.ts']);
        expect(config.test?.benchmark?.exclude).toContain('**/custom-exclude/**');
      });
    });
  });

  describe('environment target constants', () => {
    it.each([
      { envValue: 'lib', expectedLib: true, expectedTypes: false, expectedBundle: false },
      { envValue: 'types', expectedLib: false, expectedTypes: true, expectedBundle: false },
      { envValue: 'bundle', expectedLib: false, expectedTypes: false, expectedBundle: true },
      { envValue: undefined, expectedLib: false, expectedTypes: false, expectedBundle: false },
    ])('should reflect process.env.BUILD_TARGET = "$envValue" dynamically', ({
      envValue,
      expectedLib,
      expectedTypes,
      expectedBundle,
    }) => {
      const originalTarget = process.env.BUILD_TARGET;
      try {
        process.env.BUILD_TARGET = envValue;
        expect(activeBuildTarget).toBe(envValue);
        expect(isLibraryBuild).toBe(expectedLib);
        expect(isTypesBuild).toBe(expectedTypes);
        expect(isBundleBuild).toBe(expectedBundle);
      } finally {
        process.env.BUILD_TARGET = originalTarget;
      }
    });
  });
});
