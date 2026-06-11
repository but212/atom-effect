/**
 * @fileoverview Error Handling System Tests
 * @description Verifies Error hierarchy, wrapping logic, and type guards
 */

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  AtomError,
  type AtomErrorJSON,
  atom,
  ComputedError,
  computed,
  EffectError,
  effect,
  getErrorChain,
  isAtom,
  isComputed,
  isEffect,
  isPromise,
  isWritable,
  SchedulerError,
  serializeError,
} from '@/index';
import { ERROR_STRATEGIES, type ErrorStrategy } from '@/utils';

describe('Error Handling System', () => {
  const [brandStrategy, fallbackStrategy] = ERROR_STRATEGIES as [ErrorStrategy, ErrorStrategy];

  // ── Error Classes & Hierarchy ─────────────────────────────────────────────

  describe('Error Hierarchy & Integrity', () => {
    const errorTypes = [
      { Class: AtomError, name: 'AtomError', recoverable: true, tag: 'AtomError' },
      { Class: ComputedError, name: 'ComputedError', recoverable: true, tag: 'ComputedError' },
      { Class: EffectError, name: 'EffectError', recoverable: false, tag: 'EffectError' },
      { Class: SchedulerError, name: 'SchedulerError', recoverable: false, tag: 'SchedulerError' },
    ] as const;

    it.each(errorTypes)('$name confirms inheritance, default state, and optional parameters', ({
      Class,
      name,
      recoverable: defaultRecoverable,
      tag,
    }) => {
      const cause = new Error('root');

      // Default behavior
      const err = new Class('msg', { cause });
      expect(err).toBeInstanceOf(AtomError);
      expect(err.name).toBe(name);
      expect(err._tag).toBe(tag);
      expect(err.recoverable).toBe(defaultRecoverable);
      expect(err.cause).toBe(cause);

      // Override & Code
      const custom = new Class('msg', {
        cause: null,
        recoverable: !defaultRecoverable,
        code: 'ERR_CODE',
      });
      expect(custom.recoverable).toBe(!defaultRecoverable);
      expect(custom.code).toBe('ERR_CODE');
    });

    it('verifies initial error state integrity of computed atoms', () => {
      const c = computed(() => 42);
      expect(c.errors).toEqual([]);
      expect(Object.isFrozen(c.errors)).toBe(true);
    });
  });

  // ── Type Guards ───────────────────────────────────────────────────────────────

  describe('Type Guards', () => {
    it('identifies reactive primitives correctly', () => {
      const a = atom(0);
      const c = computed(() => 1);
      const e = effect(() => {});

      expect(isAtom(a)).toBe(true);
      expect(isAtom(c)).toBe(true);
      expect(isWritable(a)).toBe(true);
      expect(isWritable(c)).toBe(false);
      expect(isComputed(c)).toBe(true);
      expect(isEffect(e)).toBe(true);
      expect(isEffect(a)).toBe(false);
      e.dispose();
    });

    it.each([
      [isPromise, Promise.resolve(), true, 'native promise'],
      [isPromise, { then: () => {} }, true, 'thenable'],
      [isPromise, {}, false, 'plain object'],
      [isAtom, null, false, 'null'],
      [isAtom, 42, false, 'primitive'],
      [isEffect, undefined, false, 'undefined'],
    ])('$# target guard returns $expected for $desc', (guard, input, expected, _desc) => {
      expect(guard(input)).toBe(expected);
    });
  });

  // ── Traceability & Serialization ───────────────────────────────────────────

  describe('Advanced Features', () => {
    it('getErrorChain handles falsy causes and prevents circular loops', () => {
      // Falsy cause preservation
      expect(getErrorChain(new AtomError('m', { cause: 0 }))[1]).toBe(0);

      // Circularity protection
      const err1 = new AtomError('1');
      const err2 = new AtomError('2', { cause: err1 });
      (err1 as unknown as { cause: unknown }).cause = err2;

      const chain = getErrorChain(err1);
      expect(chain).toHaveLength(2);
      expect(chain[chain.length - 1]).toBe(err2);
    });

    it('deeply serializes complex error chains to JSON', () => {
      const top = new AtomError('top', {
        cause: new ComputedError('mid', {
          cause: new TypeError('native'),
          recoverable: true,
          code: 'C1',
        }),
      });
      const json = serializeError(top) as AtomErrorJSON;

      expect(json.message).toBe('top');
      const mid = json.cause as { code?: string; cause?: { name?: string; stack?: string } };
      expect(mid.code).toBe('C1');
      expect(mid.cause?.name).toBe('TypeError');
      expect(mid.cause?.stack).toBeDefined();
    });
  });

  // ── Error Extraction Strategies ───────────────────────────────────────────

  describe('Error Extraction Strategies', () => {
    it('should not stringify missing name and message properties on brand-based errors to literal "undefined" strings', () => {
      const customBrandError = { _tag: 'CustomError' };

      expect(brandStrategy.test(customBrandError)).toBe(true);

      const meta = brandStrategy.fetch(customBrandError);

      expect(meta.name).not.toBe('undefined');
      expect(meta.message).not.toBe('undefined');
    });

    it('should respect custom recoverable properties on standard Error objects in fallback strategy', () => {
      const stdError = new Error('Some standard error');
      (stdError as Error & { recoverable?: boolean }).recoverable = false;

      expect(fallbackStrategy.test(stdError)).toBe(true);

      const meta = fallbackStrategy.fetch(stdError);

      expect(meta.recoverable).toBe(false);
    });

    it('identifies cross-realm error objects in fallback strategy', () => {
      const context = vm.createContext();
      const crossRealmError = vm.runInContext('new Error("cross-realm")', context);

      expect(crossRealmError instanceof Error).toBe(false);
      expect(fallbackStrategy.test(crossRealmError)).toBe(true);
    });

    it('should not throw during Strategy 1 test check when e._tag property getter throws an error', () => {
      const throwingObject = {};
      Object.defineProperty(throwingObject, '_tag', {
        get() {
          throw new Error('Getter execution failed');
        },
        enumerable: true,
        configurable: true,
      });

      let isBrandError = false;
      expect(() => {
        isBrandError = brandStrategy.test(throwingObject);
      }).not.toThrow();
      expect(isBrandError).toBe(false);
    });

    it('should not throw during Strategy 1 test check when e._tag toString throws', () => {
      const throwingObject = {
        _tag: {
          toString() {
            throw new Error('toString execution failed');
          },
        },
      };

      let isBrandError = false;
      expect(() => {
        isBrandError = brandStrategy.test(throwingObject);
      }).not.toThrow();
      expect(isBrandError).toBe(false);
    });

    it('should validate and sanitize code property type to avoid type pollution', () => {
      const customBrandError = { _tag: 'CustomError', code: 500 };

      const meta = brandStrategy.fetch(customBrandError);

      expect(typeof meta.code).not.toBe('number');
      expect(meta.code).toBe('500');
    });

    it('should tolerate null-prototype metadata values during error extraction', () => {
      const nullPrototypeValue = Object.create(null);
      const customBrandError = {
        _tag: 'CustomError',
        name: nullPrototypeValue,
        message: nullPrototypeValue,
        code: nullPrototypeValue,
      };

      expect(() => brandStrategy.fetch(customBrandError)).not.toThrow();

      const meta = brandStrategy.fetch(customBrandError);
      expect(meta.name).toBe('');
      expect(meta.message).toBe('');
      expect(meta.code).toBeUndefined();
    });
  });
});
