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

  it.each(errorTypes)('$name has correct name, message, cause, and default recoverable', ({
    Class,
    name,
    expectedRecoverable,
  }) => {
    const cause = new Error('root cause');
    const err = new Class('test msg', cause);

    expect(err).toBeInstanceOf(AtomError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe(name);
    expect(err.message).toBe('test msg');
    expect(err.cause).toBe(cause);
    expect(err.recoverable).toBe(expectedRecoverable);
  });

  it.each(errorTypes)('$name defaults cause to null when omitted', ({ Class }) => {
    expect(new Class('no cause').cause).toBeNull();
  });

  it('AtomError allows overriding recoverable to false', () => {
    expect(new AtomError('fatal', null, false).recoverable).toBe(false);
  });
});

// ── wrapError() ───────────────────────────────────────────────────────────────

describe('wrapError()', () => {
  it('wraps a native Error with type + context + message format', () => {
    const native = new TypeError('native failure');
    const wrapped = wrapError(native, ComputedError, 'context');

    expect(wrapped).toBeInstanceOf(ComputedError);
    expect(wrapped.cause).toBe(native);
    expect(wrapped.message).toBe('TypeError (context): native failure');
  });

  it('returns existing AtomError as-is (idempotent, any subclass)', () => {
    const original = new SchedulerError('already wrapped');
    expect(wrapError(original, EffectError, 'ignored')).toBe(original);

    const c = new ComputedError('c');
    expect(wrapError(c, AtomError, 'ignored')).toBe(c);
  });

  it('normalizes non-Error throwables with Unexpected error format', () => {
    const wrapped = wrapError('oops', AtomError, 'ctx');
    expect(wrapped).toBeInstanceOf(AtomError);
    expect(wrapped.message).toBe('Unexpected error (ctx): oops');
    expect(wrapped.cause).toBeNull();
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
