/**
 * @fileoverview Reactivity Helpers Tests
 * @description Verifies batch, untracked, and type guard behaviors.
 */

import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { batch, isComputed, untracked } from '@/index';

describe('Reactivity Helpers', () => {
  describe('Batch', () => {
    it('executes updates synchronously and minimally', () => {
      const a = atom(0);
      const log: number[] = [];
      a.subscribe((v) => v !== undefined && log.push(v));

      const result = batch(() => {
        a.value = 1;
        a.value = 2;
        batch(() => {
          // Nested
          a.value = 3;
        });
        return 'done';
      });

      // 1. Return value pass-through
      expect(result).toBe('done');

      // 2. Coalesced updates (only final value notified)
      expect(log).toEqual([3]);
    });

    it('propagates errors and validates input', () => {
      expect(() => batch(null as unknown as () => void)).toThrow();
      expect(() =>
        batch(() => {
          throw new Error('Fail');
        })
      ).toThrow('Fail');
    });

    it('updates computed values consistently within batch', () => {
      const a = atom(0);
      const c = computed(() => a.value + 1);

      batch(() => {
        a.value = 10;
        // Pull-based computed should be fresh on access
        expect(c.value).toBe(11);
      });

      expect(c.value).toBe(11);
    });
  });

  describe('Untracked', () => {
    it('executes without tracking dependencies', () => {
      const a = atom(0);
      let computeCount = 0;

      const c = computed(() => {
        computeCount++;
        // Read 'a' inside untracked -> should NOT depend on 'a'
        return untracked(() => a.value);
      });

      expect(c.value).toBe(0);
      expect(computeCount).toBe(1);

      a.value = 1;
      // Manually check if re-computation happens on access
      expect(c.value).toBe(0); // Still old value because it didn't update
      expect(computeCount).toBe(1); // No new computation
    });

    it('handles errors and returns values', () => {
      expect(untracked(() => 42)).toBe(42);
      expect(() =>
        untracked(() => {
          throw new Error('Ops');
        })
      ).toThrow('Ops');
    });
  });

  describe('Type Guards', () => {
    it('distinguishes Computed from Atoms and others', () => {
      const a = atom(0);
      const c = computed(() => 0);
      const fake = { value: 0, subscribe: () => {}, invalidate: () => {} };

      expect(isComputed(c)).toBe(true);
      expect(isComputed(a)).toBe(false);
      expect(isComputed(fake)).toBe(false);
      expect(isComputed(null)).toBe(false);
    });
  });
});
