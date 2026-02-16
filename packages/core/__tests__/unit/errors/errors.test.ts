/**
 * @fileoverview Error Handling System Tests
 * @description Verifies Error hierarchy, wrapping logic, and type guards
 */

import { describe, expect, it } from 'vitest';
import { AtomError, ComputedError, EffectError, SchedulerError } from '@/errors/errors';
import { wrapError } from '@/utils/error';
import { isPromise } from '@/utils/type-guards';

describe('Error Handling System', () => {
  describe('Error Classes', () => {
    const errorTypes = [
      { Class: AtomError, name: 'AtomError', expectedRecoverable: true },
      { Class: ComputedError, name: 'ComputedError', expectedRecoverable: true },
      // Effect and Scheduler errors are typically fatal/non-recoverable by default
      { Class: EffectError, name: 'EffectError', expectedRecoverable: false },
      { Class: SchedulerError, name: 'SchedulerError', expectedRecoverable: false },
    ];

    it.each(errorTypes)('$name should have correct structure and defaults', ({
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

      // Verify default recoverable state
      const defaultErr = new Class('default');
      expect(defaultErr.recoverable).toBe(expectedRecoverable);
    });

    it('allows overriding recoverable status in AtomError', () => {
      const err = new AtomError('fatal', null, false);
      expect(err.recoverable).toBe(false);
    });
  });

  describe('wrapError()', () => {
    it('wraps native errors into target AtomError type', () => {
      const nativeErr = new TypeError('native failure');
      const wrapped = wrapError(nativeErr, ComputedError, 'context');

      expect(wrapped).toBeInstanceOf(ComputedError);
      expect(wrapped.cause).toBe(nativeErr);
      expect(wrapped.message).toContain('context');
      expect(wrapped.message).toContain('TypeError');
    });

    it('returns existing AtomErrors as-is (idempotent)', () => {
      const original = new SchedulerError('already wrapped');
      const result = wrapError(original, EffectError, 'new context');

      expect(result).toBe(original);
    });

    it('normalizes non-error throwables', () => {
      const stringErr = wrapError('string throw', AtomError, 'ctx');
      expect(stringErr).toBeInstanceOf(AtomError);
      expect(stringErr.message).toContain('string throw');

      const numErr = wrapError(123, AtomError, 'ctx');
      expect(numErr.message).toContain('123');
    });
  });

  describe('Type Guards', () => {
    describe('isPromise', () => {
      it('identifies Promises and Thenables correctly', () => {
        expect(isPromise(Promise.resolve())).toBe(true);
        expect(isPromise({ then: () => {} })).toBe(true);

        expect(isPromise({})).toBe(false);
        expect(isPromise(null)).toBe(false);
        expect(isPromise(123)).toBe(false);
      });
    });
  });
});
