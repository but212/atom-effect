/**
 * @fileoverview Error Handling System Tests
 * @description Verifies Error hierarchy, wrapping logic, and type guards
 */

import { describe, expect, it } from 'vitest';
import { EMPTY_ERROR_ARRAY } from '@/constants';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { AtomError, ComputedError, EffectError, SchedulerError, wrapError } from '@/errors';
import { isAtom, isComputed, isEffect, isPromise, isWritable } from '@/utils/type-guards';

// ── Error Classes ─────────────────────────────────────────────────────────────

describe('Error Classes', () => {
  const errorTypes = [
    { Class: AtomError, name: 'AtomError', expectedRecoverable: true },
    { Class: ComputedError, name: 'ComputedError', expectedRecoverable: true },
    { Class: EffectError, name: 'EffectError', expectedRecoverable: false },
    { Class: SchedulerError, name: 'SchedulerError', expectedRecoverable: false },
  ] as const;

  describe('Common inheritance and identification', () => {
    it.each(errorTypes)('$name should be identified correctly', ({
      Class,
      name,
      expectedRecoverable,
    }) => {
      const err = new Class('msg');
      expect(err).toBeInstanceOf(AtomError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe(name);
      expect(err.recoverable).toBe(expectedRecoverable);
    });
  });

  describe('Property handling', () => {
    it('should store message and cause correctly (including non-Error causes)', () => {
      const nativeCause = new Error('native');
      const err1 = new AtomError('msg', nativeCause);
      expect(err1.message).toBe('msg');
      expect(err1.cause).toBe(nativeCause);

      const stringCause = 'string cause';
      const err2 = new AtomError('msg', stringCause);
      expect(err2.cause).toBe(stringCause);
    });

    it('should default cause to null', () => {
      expect(new AtomError('msg').cause).toBeNull();
    });

    it('should allow overriding recoverable flag for AtomError', () => {
      expect(new AtomError('fatal', null, false).recoverable).toBe(false);
    });
  });

  describe('Environment specific behavior', () => {
    it('should capture stack trace starting outside constructor', () => {
      const error = new AtomError('test message');
      expect(error.stack).toBeDefined();
      // Stack trace should refer to this test file focus, not the error constructor internal frame
      expect(error.stack).not.toContain('at new AtomError');
    });
  });
});

// ── wrapError() ───────────────────────────────────────────────────────────────

describe('wrapError()', () => {
  it('should wrap native errors adding type, context and preserving original message', () => {
    const native = new TypeError('native failure');
    const wrapped = wrapError(native, ComputedError, 'FetchContext');

    expect(wrapped).toBeInstanceOf(ComputedError);
    expect(wrapped.cause).toBe(native);
    expect(wrapped.message).toBe('TypeError (FetchContext): native failure');
  });

  it('should wrap existing AtomErrors to preserve the context chain (non-idempotent)', () => {
    const inner = new SchedulerError('scheduler failure');
    const wrapped = wrapError(inner, EffectError, 'OuterEffect');

    expect(wrapped).not.toBe(inner);
    expect(wrapped.cause).toBe(inner);
    expect(wrapped.message).toContain('OuterEffect');
    expect(wrapped.message).toContain('SchedulerError');
  });

  it('should normalize non-Error throwables with Unexpected error format', () => {
    const throwable = 'primitive string';
    const wrapped = wrapError(throwable, AtomError, 'UserContext');

    expect(wrapped).toBeInstanceOf(AtomError);
    expect(wrapped.message).toBe('Unexpected error (UserContext): primitive string');
    expect(wrapped.cause).toBe(throwable);
  });
});

// ── Type Guards ───────────────────────────────────────────────────────────────

describe('isPromise()', () => {
  it('returns true for a native Promise', () => {
    expect(isPromise(Promise.resolve())).toBe(true);
  });

  it('returns true for a thenable (duck-typing)', () => {
    expect(isPromise({ then: () => {} })).toBe(true);
  });

  it('returns false for null and undefined', () => {
    expect(isPromise(null)).toBe(false);
    expect(isPromise(undefined)).toBe(false);
  });

  it('returns false for plain object without then', () => {
    expect(isPromise({})).toBe(false);
  });
});

describe('isAtom()', () => {
  it('returns true for writable and computed atoms', () => {
    expect(isAtom(atom(0))).toBe(true);
    expect(isAtom(computed(() => 1))).toBe(true);
  });

  it('returns false for null and primitives', () => {
    expect(isAtom(null)).toBe(false);
    expect(isAtom(42)).toBe(false);
    expect(isAtom({})).toBe(false);
  });
});

describe('isWritable()', () => {
  it('returns true for writable atom, false for computed and non-atoms', () => {
    expect(isWritable(atom(0))).toBe(true);
    expect(isWritable(computed(() => 1))).toBe(false);
    expect(isWritable(null)).toBe(false);
    expect(isWritable(0)).toBe(false);
  });
});

describe('isComputed()', () => {
  it('returns true for computed, false for writable atom and non-atoms', () => {
    expect(isComputed(computed(() => 1))).toBe(true);
    expect(isComputed(atom(0))).toBe(false);
    expect(isComputed(null)).toBe(false);
    expect(isComputed({})).toBe(false);
  });
});

describe('isEffect()', () => {
  it('returns true for an effect, false for atoms and non-effects', () => {
    const e = effect(() => {});
    expect(isEffect(e)).toBe(true);
    e.dispose();

    expect(isEffect(atom(0))).toBe(false);
    expect(isEffect(null)).toBe(false);
    expect(isEffect({})).toBe(false);
  });
});

// ── EMPTY_ERROR_ARRAY ─────────────────────────────────────────────────────────

describe('EMPTY_ERROR_ARRAY', () => {
  it('is a frozen empty array and is returned by identity from error-free computed', () => {
    expect(EMPTY_ERROR_ARRAY).toHaveLength(0);
    expect(Object.isFrozen(EMPTY_ERROR_ARRAY)).toBe(true);

    const c = computed(() => 42);
    c.value;
    expect(c.errors).toBe(EMPTY_ERROR_ARRAY);
  });
});
