import { describe, expect, it } from 'vitest';
import {
  AsyncState,
  ATOM_STATE_FLAGS,
  COMPUTED_CONFIG,
  COMPUTED_STATE_FLAGS,
  EFFECT_STATE_FLAGS,
  EMPTY_ERROR_ARRAY,
  IS_DEV,
  SMI_MAX,
  STATE_MASKS,
} from '@/constants';

describe('Constants Integrity (Refactored)', () => {
  describe('Bit Flags Uniqueness & Partitioning', () => {
    it('should have unique bits for all key flags across primitives', () => {
      const flags = [
        EFFECT_STATE_FLAGS.EXECUTING,
        COMPUTED_STATE_FLAGS.DIRTY,
        COMPUTED_STATE_FLAGS.RECOMPUTING,
        COMPUTED_STATE_FLAGS.IDLE,
        ATOM_STATE_FLAGS.SYNC,
        ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED,
      ];

      const uniqueFlags = new Set(flags);
      expect(uniqueFlags.size).toBe(flags.length);
    });

    it('should maintain consistent DISPOSED bit at 1 << 0', () => {
      expect(EFFECT_STATE_FLAGS.DISPOSED).toBe(1 << 0);
      expect(COMPUTED_STATE_FLAGS.DISPOSED).toBe(1 << 0);
      expect(ATOM_STATE_FLAGS.DISPOSED).toBe(1 << 0);
    });

    it('should have IS_COMPUTED marker at 1 << 1', () => {
      expect(COMPUTED_STATE_FLAGS.IS_COMPUTED).toBe(1 << 1);
    });
  });

  describe('Compound State Masks', () => {
    it('ASYNC_STATE mask should cover all async bits', () => {
      const asyncBits =
        COMPUTED_STATE_FLAGS.IDLE |
        COMPUTED_STATE_FLAGS.PENDING |
        COMPUTED_STATE_FLAGS.RESOLVED |
        COMPUTED_STATE_FLAGS.REJECTED;

      expect(STATE_MASKS.ASYNC_STATE).toBe(asyncBits);
    });
  });

  describe('Environment & Platform Limits', () => {
    it('IS_DEV should be correctly evaluated as a boolean', () => {
      expect(typeof IS_DEV).toBe('boolean');
    });

    it('SMI_MAX should be exactly 0x3fffffff (V8 31-bit SMI limit)', () => {
      expect(SMI_MAX).toBe(0x3fffffff);
    });

    it('MAX_PROMISE_ID should be safe for increments without overflowing MAX_SAFE_INTEGER', () => {
      expect(COMPUTED_CONFIG.MAX_PROMISE_ID).toBeLessThan(Number.MAX_SAFE_INTEGER);
      expect(COMPUTED_CONFIG.MAX_PROMISE_ID + 1).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Immutability & Safety', () => {
    it('all constant objects should be strictly frozen', () => {
      expect(Object.isFrozen(AsyncState)).toBe(true);
      expect(Object.isFrozen(EFFECT_STATE_FLAGS)).toBe(true);
      expect(Object.isFrozen(COMPUTED_STATE_FLAGS)).toBe(true);
      expect(Object.isFrozen(ATOM_STATE_FLAGS)).toBe(true);
      expect(Object.isFrozen(STATE_MASKS)).toBe(true);
      expect(Object.isFrozen(EMPTY_ERROR_ARRAY)).toBe(true);
    });
  });
});
