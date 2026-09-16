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
  baseCoverageExclusionPatterns,
  defineViteConfig,
  defineVitestBenchConfig,
  defineVitestConfig,
  getBaseViteConfig,
  getBaseVitestBenchmarkConfig,
  getBaseVitestConfig,
  getResolveConfig,
  toKebabCase,
} from '../src/index';

type ConfigFactory<T> = () => T | Promise<T>;

const TEST_DIRECTORY_PATH = '/test/dir';
const TEST_PACKAGE_NAME = 'TestPackage';
const TEST_KEBAB_NAME = 'test-package';

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
        ['AtomEffectJQuery', 'atom-effect-jquery'],
      ])('should convert "%s" to "%s"', (input, expected) => {
        expect(toKebabCase(input)).toBe(expected);
      });
    });

    describe('getResolveConfig', () => {
      it('should generate resolve alias config pointing to package src', () => {
        expect(getResolveConfig(TEST_DIRECTORY_PATH)).toEqual({
          alias: {
            '@': `${TEST_DIRECTORY_PATH}/src`,
          },
        });
      });

      it('should normalize path separators to forward slashes on Windows', () => {
        const windowsPath = 'C:\\Users\\redog\\project\\atom-effect';
        const resolveConfig = getResolveConfig(windowsPath);
        expect(resolveConfig.alias['@']).toBe('C:/Users/redog/project/atom-effect/src');
      });
    });
  });

  describe('vite config helpers', () => {
    describe('getBaseViteConfig', () => {
      it('should generate configuration with default parameters', () => {
        const viteConfig = getBaseViteConfig({
          packageDir: TEST_DIRECTORY_PATH,
          name: TEST_PACKAGE_NAME,
        });

        expect(viteConfig.resolve?.alias).toEqual({ '@': `${TEST_DIRECTORY_PATH}/src` });
        expect(viteConfig.build?.target).toBe('ES2022');
        expect(viteConfig.build?.sourcemap).toBe(true);
        expect(viteConfig.build?.outDir).toBe('dist');

        const libraryOptions = viteConfig.build?.lib;
        expect(libraryOptions).toBeTypeOf('object');
        if (libraryOptions && typeof libraryOptions === 'object') {
          expect(libraryOptions.entry).toBe(`${TEST_DIRECTORY_PATH}/src/index.ts`);
          expect(libraryOptions.name).toBe(TEST_PACKAGE_NAME);
          expect(libraryOptions.formats).toEqual(['es']);
        }
      });

      it('should format filename using kebab-case for UMD builds', () => {
        const viteConfig = getBaseViteConfig({
          packageDir: TEST_DIRECTORY_PATH,
          name: TEST_PACKAGE_NAME,
          formats: ['umd'],
        });

        const libraryOptions = viteConfig.build?.lib;
        expect(libraryOptions).toBeTypeOf('object');
        const getFileName = (libraryOptions as LibraryOptions)?.fileName as (
          format: string,
          entryName: string
        ) => string;
        expect(getFileName).toBeTypeOf('function');
        expect(getFileName('umd', 'index')).toBe(`${TEST_KEBAB_NAME}.min.js`);
        expect(getFileName?.('es', 'index')).toBe('index.mjs');
        expect(getFileName?.('cjs', 'index')).toBe('index.cjs');
      });

      it('should apply custom filename overrides if specified', () => {
        const viteConfig = getBaseViteConfig({
          packageDir: TEST_DIRECTORY_PATH,
          name: TEST_PACKAGE_NAME,
          libFileNames: {
            es: 'custom.js',
          },
        });

        const libraryOptions = viteConfig.build?.lib;
        expect(libraryOptions).toBeTypeOf('object');
        const getFileName = (libraryOptions as LibraryOptions)?.fileName as (
          format: string,
          entryName: string
        ) => string;
        expect(getFileName).toBeTypeOf('function');
        expect(getFileName('es', 'index')).toBe('custom.js');
        expect(getFileName?.('umd', 'index')).toBe(`${TEST_KEBAB_NAME}.min.js`);
      });

      describe('buildTarget options', () => {
        it('should structure formats for bundle target', () => {
          const viteConfig = getBaseViteConfig({
            packageDir: TEST_DIRECTORY_PATH,
            name: TEST_PACKAGE_NAME,
            buildTarget: 'bundle',
          });

          const libraryOptions = viteConfig.build?.lib;
          expect(libraryOptions).toBeTypeOf('object');
          expect((libraryOptions as LibraryOptions)?.formats).toEqual(['umd']);
        });

        it('should structure formats for lib target', () => {
          const viteConfig = getBaseViteConfig({
            packageDir: TEST_DIRECTORY_PATH,
            name: TEST_PACKAGE_NAME,
            buildTarget: 'lib',
          });

          const libraryOptions = viteConfig.build?.lib;
          expect(libraryOptions).toBeTypeOf('object');
          expect((libraryOptions as LibraryOptions)?.formats).toEqual(['es', 'cjs']);
        });

        it('should configure settings for types target', () => {
          const viteConfig = getBaseViteConfig({
            packageDir: TEST_DIRECTORY_PATH,
            name: TEST_PACKAGE_NAME,
            buildTarget: 'types',
          });
          expect(viteConfig.build?.emptyOutDir).toBe(true);
          expect(viteConfig.plugins).toHaveLength(1);
        });

        it('should resolve tsconfigPath relative to packageDir instead of hardcoding ./tsconfig.build.json', () => {
          mockDts.mockClear();
          getBaseViteConfig({
            packageDir: TEST_DIRECTORY_PATH,
            name: TEST_PACKAGE_NAME,
            buildTarget: 'types',
          });
          expect(mockDts).toHaveBeenCalled();
          const callArgs = mockDts.mock.calls[0]?.[0];
          expect(callArgs).toBeDefined();
          expect(callArgs?.tsconfigPath).toBe(`${TEST_DIRECTORY_PATH}/tsconfig.build.json`);
        });
      });
    });

    describe('defineViteConfig', () => {
      it('should merge user overrides into the base configuration', async () => {
        const configFactory = defineViteConfig(
          { packageDir: TEST_DIRECTORY_PATH, name: TEST_PACKAGE_NAME },
          { build: { target: 'ES2020', minify: false } }
        );

        expect(typeof configFactory).toBe('function');
        const viteConfig = await (configFactory as ConfigFactory<UserConfig>)();

        expect(viteConfig.build?.target).toBe('ES2020');
        expect(viteConfig.build?.minify).toBe(false);
        expect(viteConfig.resolve?.alias).toEqual({ '@': `${TEST_DIRECTORY_PATH}/src` });
      });

      it('should support an override factory function receiving BuildEnv', async () => {
        const configFactory = defineViteConfig(
          { packageDir: TEST_DIRECTORY_PATH, name: TEST_PACKAGE_NAME, buildTarget: 'bundle' },
          ({ isBundle }) => ({
            build: {
              minify: isBundle,
            },
          })
        );

        const viteConfig = await (configFactory as ConfigFactory<UserConfig>)();
        expect(viteConfig.build?.minify).toBe(true);
      });
    });
  });

  describe('vitest config helpers', () => {
    describe('getBaseVitestConfig', () => {
      it('should generate base vitest config with default coverage options', () => {
        const vitestConfig = getBaseVitestConfig(TEST_DIRECTORY_PATH);
        expect(vitestConfig.resolve?.alias).toEqual({ '@': `${TEST_DIRECTORY_PATH}/src` });
        expect(vitestConfig.test?.globals).toBe(true);
        expect(vitestConfig.test?.coverage?.provider).toBe('v8');
        expect(vitestConfig.test?.coverage?.exclude).toBe(baseCoverageExclusionPatterns);
      });
    });

    describe('defineVitestConfig', () => {
      it('should merge Vitest overrides successfully', async () => {
        const configFactory = defineVitestConfig(TEST_DIRECTORY_PATH, {
          test: {
            environment: 'jsdom',
            globals: false,
          },
        });

        expect(typeof configFactory).toBe('function');
        const vitestConfig = await (configFactory as ConfigFactory<ViteUserConfig>)();

        expect(vitestConfig.test?.environment).toBe('jsdom');
        expect(vitestConfig.test?.globals).toBe(false);
        expect(vitestConfig.resolve?.alias).toEqual({ '@': `${TEST_DIRECTORY_PATH}/src` });
      });
    });
  });

  describe('benchmark config helpers', () => {
    describe('getBaseVitestBenchConfig', () => {
      it('should generate base benchmarking configurations', () => {
        const vitestConfig = getBaseVitestBenchmarkConfig(TEST_DIRECTORY_PATH);
        expect(vitestConfig.resolve?.alias).toEqual({ '@': `${TEST_DIRECTORY_PATH}/src` });
        expect(vitestConfig.test?.benchmark?.include).toEqual(['__benchmarks__/**/*.bench.ts']);
      });
    });

    describe('defineVitestBenchConfig', () => {
      it('should completely override the benchmark include array instead of concatenating it', async () => {
        const configFactory = defineVitestBenchConfig(TEST_DIRECTORY_PATH, {
          test: {
            benchmark: {
              include: ['my-bench.ts'],
            },
          },
        });

        expect(typeof configFactory).toBe('function');
        const vitestConfig = await (configFactory as ConfigFactory<ViteUserConfig>)();
        expect(vitestConfig.test?.benchmark?.include).toEqual(['my-bench.ts']);
      });

      it('should merge other Vitest benchmark configuration properties successfully', async () => {
        const configFactory = defineVitestBenchConfig(TEST_DIRECTORY_PATH, {
          test: {
            benchmark: {
              exclude: ['**/custom-exclude/**'],
            },
          },
        });

        const vitestConfig = await (configFactory as ConfigFactory<ViteUserConfig>)();
        expect(vitestConfig.test?.benchmark?.include).toEqual(['__benchmarks__/**/*.bench.ts']);
        expect(vitestConfig.test?.benchmark?.exclude).toContain('**/custom-exclude/**');
      });
    });
  });
});
