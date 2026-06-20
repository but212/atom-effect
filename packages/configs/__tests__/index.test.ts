import type { UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';
import {
  baseCoverageExclude,
  defineViteConfig,
  defineVitestBenchConfig,
  defineVitestConfig,
  getBaseViteConfig,
  getBaseVitestBenchConfig,
  getBaseVitestConfig,
  getResolveConfig,
  toKebabCase,
} from '../src/index';

type ConfigFn<T> = () => T | Promise<T>;

const TEST_DIR = '/test/dir';
const TEST_PKG = 'TestPackage';
const TEST_KEBAB = 'test-package';

describe('packages/configs', () => {
  describe('utility helpers', () => {
    describe('toKebabCase', () => {
      it('should convert PascalCase to kebab-case', () => {
        expect(toKebabCase('MyLibrary')).toBe('my-library');
      });

      it('should convert camelCase to kebab-case', () => {
        expect(toKebabCase('someCoolName')).toBe('some-cool-name');
      });

      it('should keep already kebab-cased strings unchanged', () => {
        expect(toKebabCase('already-kebab')).toBe('already-kebab');
      });

      it('should keep simple lowercase strings unchanged', () => {
        expect(toKebabCase('lowercase')).toBe('lowercase');
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
        expect(lib).toBeDefined();
        expect(lib).not.toBe(false);
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
        expect(lib && typeof lib === 'object').toBe(true);
        if (lib && typeof lib === 'object') {
          const fileNameFn = lib.fileName;
          expect(typeof fileNameFn).toBe('function');
          if (typeof fileNameFn === 'function') {
            expect(fileNameFn('umd', 'index')).toBe(`${TEST_KEBAB}.min.js`);
            expect(fileNameFn('es', 'index')).toBe('index.mjs');
            expect(fileNameFn('cjs', 'index')).toBe('index.cjs');
          }
        }
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
        expect(lib && typeof lib === 'object').toBe(true);
        if (lib && typeof lib === 'object') {
          const fileNameFn = lib.fileName;
          expect(typeof fileNameFn).toBe('function');
          if (typeof fileNameFn === 'function') {
            expect(fileNameFn('es', 'index')).toBe('custom.js');
            expect(fileNameFn('umd', 'index')).toBe(`${TEST_KEBAB}.min.js`);
          }
        }
      });

      describe('buildTarget options', () => {
        it('should structure formats for bundle target', () => {
          const config = getBaseViteConfig({
            packageDir: TEST_DIR,
            name: TEST_PKG,
            buildTarget: 'bundle',
          });

          const lib = config.build?.lib;
          expect(lib && typeof lib === 'object').toBe(true);
          if (lib && typeof lib === 'object') {
            expect(lib.formats).toEqual(['umd']);
          }
        });

        it('should structure formats for lib target', () => {
          const config = getBaseViteConfig({
            packageDir: TEST_DIR,
            name: TEST_PKG,
            buildTarget: 'lib',
          });

          const lib = config.build?.lib;
          expect(lib && typeof lib === 'object').toBe(true);
          if (lib && typeof lib === 'object') {
            expect(lib.formats).toEqual(['es', 'cjs']);
          }
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
        expect(config.test?.coverage?.exclude).toBe(baseCoverageExclude);
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
        const config = getBaseVitestBenchConfig(TEST_DIR);
        expect(config.resolve?.alias).toEqual({ '@': `${TEST_DIR}/src` });
        expect(config.test?.benchmark?.include).toEqual(['__benchmarks__/**/*.bench.ts']);
      });
    });

    describe('defineVitestBenchConfig', () => {
      it('should merge Vitest benchmark overrides successfully', async () => {
        const configFn = defineVitestBenchConfig(TEST_DIR, {
          test: {
            benchmark: {
              include: ['my-bench.ts'],
            },
          },
        });

        expect(typeof configFn).toBe('function');
        const config = await (configFn as ConfigFn<ViteUserConfig>)();
        expect(config.test?.benchmark?.include).toEqual([
          '__benchmarks__/**/*.bench.ts',
          'my-bench.ts',
        ]);
      });
    });
  });
});
