/**
 * @fileoverview Error Handling System Tests
 * @description Verifies Error hierarchy, wrapping logic, and type guards
 */

import { describe, expect, it } from 'vitest';
import {
  AtomError,
  atom,
  ComputedError,
  computed,
  EffectError,
  effect,
  isAtom,
  isComputed,
  isEffect,
  isPromise,
  isWritable,
  SchedulerError,
} from '@/index';

describe('Error Handling System', () => {
  // ── Error Classes & Constructor ─────────────────────────────────────────────

  describe('Error Hierarchy', () => {
    const errorTypes = [
      { Class: AtomError, name: 'AtomError', recoverable: true },
      { Class: ComputedError, name: 'ComputedError', recoverable: true },
      { Class: EffectError, name: 'EffectError', recoverable: false },
      { Class: SchedulerError, name: 'SchedulerError', recoverable: false },
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

  it('verifies initial error state integrity', () => {
    const c = computed(() => 42);
    expect(c.errors).toEqual([]);
    expect(Object.isFrozen(c.errors)).toBe(true);
  });
});
