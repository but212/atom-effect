/**
 * @fileoverview Error Handling System Tests
 * @description Verifies Error hierarchy, wrapping logic, and type guards
 */

import { describe, expect, it } from 'vitest';
import { EMPTY_ERROR_ARRAY } from '@/constants';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import {
  AtomError,
  type AtomErrorConstructor,
  ComputedError,
  EffectError,
  SchedulerError,
  wrapError,
} from '@/errors';
import { isAtom, isComputed, isEffect, isPromise, isWritable } from '@/utils/type-guards';

describe('Error Handling System', () => {
  // ── Error Classes & Constructor ─────────────────────────────────────────────

  describe('Error Hierarchy', () => {
    const errorTypes = [
      { Class: AtomError as AtomErrorConstructor, name: 'AtomError', recoverable: true },
      { Class: ComputedError as AtomErrorConstructor, name: 'ComputedError', recoverable: true },
      { Class: EffectError as AtomErrorConstructor, name: 'EffectError', recoverable: false },
      { Class: SchedulerError as AtomErrorConstructor, name: 'SchedulerError', recoverable: false },
    ] as const;

    it.each(errorTypes)('$name confirms inheritance, default state, and optional parameters', ({
      Class,
      name,
      recoverable: defaultRecoverable,
    }) => {
      const cause = new Error('root');

      // Default behavior
      const err = new Class('msg', cause);
      expect(err).toBeInstanceOf(AtomError);
      expect(err.name).toBe(name);
      expect(err.recoverable).toBe(defaultRecoverable);
      expect(err.cause).toBe(cause);

      // Override & Code (Merged: removed separate it blocks)
      const custom = new Class('msg', null, !defaultRecoverable, 'ERR_CODE');
      expect(custom.recoverable).toBe(!defaultRecoverable);
      expect(custom.code).toBe('ERR_CODE');
    });
  });

  // ── wrapError() ───────────────────────────────────────────────────────────────

  describe('wrapError() logic', () => {
    it('wraps various types of causes correctly', () => {
      // 1. Native error wrapping
      const native = new TypeError('fail');
      const wrapped = wrapError(native, ComputedError, 'ctx');
      expect(wrapped.message).toBe('TypeError (ctx): fail');
      expect(wrapped.cause).toBe(native);

      // 2. Accumulation (Chainable) - Preserves traceability
      const secondWrap = wrapError(wrapped, EffectError, 'outer');
      expect(secondWrap.cause).toBe(wrapped);
      expect(secondWrap.message).toContain('outer');

      // 3. Non-Error value preservation
      const raw = { status: 500 };
      expect(wrapError(raw, AtomError, 'api').cause).toBe(raw);
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
    it('getChain handles falsy causes and prevents circular loops', () => {
      // Falsy cause preservation
      expect(new AtomError('m', 0).getChain()[1]).toBe(0);

      // Circularity protection
      const err1 = new AtomError('1');
      const err2 = new AtomError('2', err1);
      (err1 as unknown as { cause: unknown }).cause = err2;

      const chain = err1.getChain();
      expect(chain).toHaveLength(3);
      expect(chain[chain.length - 1]).toBe(err1);
    });

    it('deeply serializes complex error chains to JSON', () => {
      const top = new AtomError(
        'top',
        new ComputedError('mid', new TypeError('native'), true, 'C1')
      );
      const json = top.toJSON();

      expect(json.message).toBe('top');
      const mid = json.cause as { code?: string; cause?: { name?: string; stack?: string } };
      expect(mid.code).toBe('C1');
      expect(mid.cause?.name).toBe('TypeError');
      expect(mid.cause?.stack).toBeDefined();
    });
  });

  // ── Maintenance ─────────────────────────────────────────────────────────────

  it('verifies EMPTY_ERROR_ARRAY integrity', () => {
    expect(Object.isFrozen(EMPTY_ERROR_ARRAY)).toBe(true);
    expect(computed(() => 42).errors).toBe(EMPTY_ERROR_ARRAY);
  });
});
