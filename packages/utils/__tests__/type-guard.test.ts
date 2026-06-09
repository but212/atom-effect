import { describe, expect, it } from 'vitest';
import { isOption, isPromise, isResult, Option, Result } from '@/index';
import { OPTION_SYMBOL, RESULT_SYMBOL } from '../src/symbols';

describe('Type Guards', () => {
  describe('isPromise', () => {
    describe('native promises', () => {
      it('should return true for native Promise instances', () => {
        expect(isPromise(Promise.resolve(42))).toBe(true);
        expect(isPromise(new Promise((resolve) => resolve(42)))).toBe(true);
        expect(isPromise(Promise.reject(new Error('fail')).catch(() => {}))).toBe(true);
      });
    });

    describe('thenable / duck-typed promises', () => {
      it('should return true for objects with a then method', () => {
        const thenableObj = {
          then(resolve: () => void) {
            resolve();
          },
        };
        expect(isPromise(thenableObj)).toBe(true);
      });

      it('should return true for functions with a then method', () => {
        const thenableFn = Object.assign(() => {}, {
          then(resolve: () => void) {
            resolve();
          },
        });
        expect(isPromise(thenableFn)).toBe(true);
      });

      it('should return true for custom classes with a then method', () => {
        class CustomThenable {
          then(resolve: () => void) {
            resolve();
          }
        }
        expect(isPromise(new CustomThenable())).toBe(true);
      });

      it('should return true for arrays with a then method', () => {
        const arr = Object.assign([], {
          then(resolve: () => void) {
            resolve();
          },
        });
        expect(isPromise(arr)).toBe(true);
      });
    });

    describe('non-promise values', () => {
      describe('null and undefined', () => {
        it('should return false for null', () => {
          expect(isPromise(null)).toBe(false);
        });

        it('should return false for undefined', () => {
          expect(isPromise(undefined)).toBe(false);
        });
      });

      describe('primitives', () => {
        it('should return false for numbers', () => {
          expect(isPromise(0)).toBe(false);
          expect(isPromise(42)).toBe(false);
          expect(isPromise(-1)).toBe(false);
          expect(isPromise(NaN)).toBe(false);
          expect(isPromise(Infinity)).toBe(false);
        });

        it('should return false for strings', () => {
          expect(isPromise('')).toBe(false);
          expect(isPromise('promise')).toBe(false);
        });

        it('should return false for booleans', () => {
          expect(isPromise(true)).toBe(false);
          expect(isPromise(false)).toBe(false);
        });

        it('should return false for symbols', () => {
          expect(isPromise(Symbol('test'))).toBe(false);
        });

        it('should return false for bigints', () => {
          expect(isPromise(10n)).toBe(false);
        });
      });

      describe('objects without then / non-function then', () => {
        it('should return false for plain objects', () => {
          expect(isPromise({})).toBe(false);
          expect(isPromise({ a: 1 })).toBe(false);
        });

        it('should return false for objects where then is not a function', () => {
          expect(isPromise({ then: 42 })).toBe(false);
          expect(isPromise({ then: 'string' })).toBe(false);
          expect(isPromise({ then: {} })).toBe(false);
          expect(isPromise({ then: null })).toBe(false);
          expect(isPromise({ then: undefined })).toBe(false);
          expect(isPromise({ then: true })).toBe(false);
        });

        it('should return false for arrays without then', () => {
          expect(isPromise([])).toBe(false);
          expect(isPromise([1, 2, 3])).toBe(false);
        });

        it('should return false for arrays where then is not a function', () => {
          const arr = Object.assign([], { then: 42 });
          expect(isPromise(arr)).toBe(false);
        });
      });

      describe('functions without then / non-function then', () => {
        it('should return false for standard functions', () => {
          expect(isPromise(() => {})).toBe(false);
        });

        it('should return false for functions where then is not a function', () => {
          const fn = Object.assign(() => {}, { then: 42 });
          expect(isPromise(fn)).toBe(false);
        });
      });

      describe('other built-in objects', () => {
        it('should return false for Date instances', () => {
          expect(isPromise(new Date())).toBe(false);
        });

        it('should return false for RegExp instances', () => {
          expect(isPromise(/regex/)).toBe(false);
        });

        it('should return false for Map and Set instances', () => {
          expect(isPromise(new Map())).toBe(false);
          expect(isPromise(new Set())).toBe(false);
        });

        it('should return false for Error instances', () => {
          expect(isPromise(new Error('error'))).toBe(false);
        });
      });
    });
  });

  describe('isOption', () => {
    it('should return true for Option.some and Option.none', () => {
      expect(isOption(Option.some(42))).toBe(true);
      expect(isOption(Option.none)).toBe(true);
    });

    it('should return false for non-Option values', () => {
      expect(isOption(null)).toBe(false);
      expect(isOption(undefined)).toBe(false);
      expect(isOption(42)).toBe(false);
      expect(isOption('some')).toBe(false);
      expect(isOption({})).toBe(false);
      expect(isOption({ ok: true })).toBe(false);
    });

    it('should reject fake Option objects', () => {
      const fakeOption = {
        ok: true,
        value: 42,
        [OPTION_SYMBOL]: true,
      };
      expect(isOption(fakeOption)).toBe(false);
    });

    it('should distinguish Option from Result', () => {
      expect(isOption(Result.ok(42))).toBe(false);
      expect(isOption(Result.err(new Error('fail')))).toBe(false);
    });
  });

  describe('isResult', () => {
    it('should return true for Ok and Err Result instances', () => {
      expect(isResult(Result.ok(42))).toBe(true);
      expect(isResult(Result.err('error'))).toBe(true);
    });

    it('should return false for non-Result values', () => {
      expect(isResult(null)).toBe(false);
      expect(isResult(undefined)).toBe(false);
      expect(isResult(42)).toBe(false);
      expect(isResult('result')).toBe(false);
      expect(isResult({})).toBe(false);
      expect(isResult({ ok: true, value: 42, error: undefined })).toBe(false);
    });

    it('should reject fake Result objects', () => {
      const fakeResult = {
        ok: true,
        value: 42,
        error: undefined,
        [RESULT_SYMBOL]: true,
      };
      expect(isResult(fakeResult)).toBe(false);
    });

    it('should distinguish Result from Option', () => {
      expect(isResult(Option.some(42))).toBe(false);
      expect(isResult(Option.none)).toBe(false);
    });
  });
});
