/**
 * @fileoverview Error Handling System Tests
 */

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  AtomError,
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
import { getErrorMetadata } from '@/utils';

describe('Error Handling System', () => {
  describe('Error classes (AtomError, ComputedError, etc.)', () => {
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

      const error = new Class('msg', { cause });
      expect(error).toBeInstanceOf(AtomError);
      expect(error.name).toBe(name);
      expect(error._tag).toBe(tag);
      expect(error.recoverable).toBe(defaultRecoverable);
      expect(error.cause).toBe(cause);

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

  describe('Type guards (isAtom, isWritable, etc.)', () => {
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

  describe('getErrorChain() / serializeError()', () => {
    it('getErrorChain handles falsy causes and prevents circular loops', () => {
      expect(getErrorChain(new AtomError('m', { cause: 0 }))[1]).toBe(0);

      const err1 = new AtomError('1');
      const err2 = new AtomError('2', { cause: err1 });
      Reflect.set(err1, 'cause', err2);

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
      const json = serializeError(top);

      expect(json.message).toBe('top');
      const mid = Reflect.get(json as object, 'cause');
      expect(mid.code).toBe('C1');
      expect(mid.cause?.name).toBe('TypeError');
      expect(mid.cause?.stack).toBeDefined();
    });

    it('serializeError returns non-Error objects as is', () => {
      const obj = { x: 1 };
      expect(serializeError(obj)).toBe(obj);
      expect(serializeError(123)).toBe(123);
      expect(serializeError('hello')).toBe('hello');
    });

    it('serializeError handles circular reference metadata correctly', () => {
      const circularErr = new Error('circular error');
      circularErr.name = 'MyCustomError';
      const circularErrExt = circularErr as unknown as Record<string, unknown>;
      circularErrExt.recoverable = false;
      circularErrExt.code = 'ERR_CODE';
      circularErrExt.cause = circularErr;

      const serialized = serializeError(circularErr);

      expect(serialized.cause).toEqual({
        name: 'MyCustomError',
        message: '[Circular Reference]',
        recoverable: false,
        code: 'ERR_CODE',
      });
    });
  });

  describe('getErrorMetadata (unified normalization)', () => {
    it('should not stringify missing name and message properties on brand-based errors to literal "undefined" strings', () => {
      const customBrandError = { _tag: 'CustomError' };
      const meta = getErrorMetadata(customBrandError);

      expect(meta.name).not.toBe('undefined');
      expect(meta.message).not.toBe('undefined');
      expect(meta.name).toBe('');
      expect(meta.message).toBe('');
    });

    it('should respect custom recoverable properties on standard Error objects', () => {
      const stdError = new Error('Some standard error');
      (stdError as { recoverable?: boolean }).recoverable = false;

      const meta = getErrorMetadata(stdError);
      expect(meta.recoverable).toBe(false);
    });

    it('identifies cross-realm error objects correctly', () => {
      const context = vm.createContext();
      const crossRealmError = vm.runInContext('new Error("cross-realm")', context);

      expect(crossRealmError instanceof Error).toBe(false);
      const meta = getErrorMetadata(crossRealmError);
      expect(meta.name).toBe('Error');
      expect(meta.message).toBe('cross-realm');
    });

    it('should not throw when e._tag property getter throws an error', () => {
      const throwingObject = {};
      Object.defineProperty(throwingObject, '_tag', {
        get() {
          throw new Error('Getter execution failed');
        },
        enumerable: true,
        configurable: true,
      });

      expect(() => {
        const meta = getErrorMetadata(throwingObject);
        expect(meta.name).toBe('Unexpected error');
      }).not.toThrow();
    });

    it('should not throw when e._tag toString throws', () => {
      const throwingObject = {
        _tag: {
          toString() {
            throw new Error('toString execution failed');
          },
        },
      };

      expect(() => {
        const meta = getErrorMetadata(throwingObject);
        expect(meta.name).toBe('Unexpected error');
      }).not.toThrow();
    });

    it('should validate and sanitize code property type to avoid type pollution', () => {
      const customBrandError = { _tag: 'CustomError', code: 500 };
      const meta = getErrorMetadata(customBrandError);

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

      expect(() => getErrorMetadata(customBrandError)).not.toThrow();

      const meta = getErrorMetadata(customBrandError);
      expect(meta.name).toBe('');
      expect(meta.message).toBe('');
      expect(meta.code).toBeUndefined();
    });

    it('handles unexpected inputs (null, undefined, primitives) for getErrorMetadata', () => {
      const nullMeta = getErrorMetadata(null);
      expect(nullMeta.name).toBe('Unexpected error');
      expect(nullMeta.message).toBe('');

      const undefinedMeta = getErrorMetadata(undefined);
      expect(undefinedMeta.name).toBe('Unexpected error');
      expect(undefinedMeta.message).toBe('');

      const numberMeta = getErrorMetadata(123);
      expect(numberMeta.name).toBe('Unexpected error');
      expect(numberMeta.message).toBe('123');

      const stringMeta = getErrorMetadata('some raw error');
      expect(stringMeta.name).toBe('Unexpected error');
      expect(stringMeta.message).toBe('some raw error');
    });

    it('should handle Object.create(null) as input without throwing', () => {
      const nullProtoError = Object.create(null);
      nullProtoError.message = 'No prototype message';

      expect(() => {
        const meta = getErrorMetadata(nullProtoError);
        expect(meta.message).toBe('');
      }).not.toThrow();
    });

    it('serializeError handles deeply nested errors with circular reference correctly', () => {
      const parent = new Error('Parent error');
      const child = new Error('Child error');
      parent.cause = child;
      child.cause = parent; // circular dependency

      const serialized = serializeError(parent) as {
        message: string;
        cause: { message: string; cause: { message: string } };
      };
      expect(serialized.message).toBe('Parent error');
      expect(serialized.cause.message).toBe('Child error');
      expect(serialized.cause.cause.message).toBe('[Circular Reference]');
    });
  });
});
