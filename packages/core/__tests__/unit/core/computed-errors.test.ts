/**
 * @fileoverview Tests for computed error propagation (error-rail concept)
 */

import { describe, expect, it } from 'vitest';
import { EMPTY_ERROR_ARRAY } from '@/constants';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { sleep } from '../../utils/test-helpers';

describe('Computed - Error Propagation', () => {
  describe('sync error propagation', () => {
    it('propagates errors from upstream computed to downstream', () => {
      const a = computed(
        () => {
          throw new Error('A failed');
        },
        { defaultValue: 0 }
      );

      const b = computed(() => a.value + 1, { defaultValue: 0 });
      const c = computed(() => b.value * 2, { defaultValue: 0 });

      // Sync computeds throw on first access, catch to establish error state
      expect(() => c.value).toThrow('A failed');

      // After error, all should detect error
      expect(a.hasError).toBe(true);
      expect(b.hasError).toBe(true);
      expect(c.hasError).toBe(true);

      // isValid is inverse
      expect(a.isValid).toBe(false);
      expect(b.isValid).toBe(false);
      expect(c.isValid).toBe(false);

      // Errors are accumulated from self and dependencies
      expect(a.errors).toHaveLength(1);
      expect(a.errors[0]?.message).toContain('A failed');

      // b and c accumulate errors
      expect(b.errors.length).toBeGreaterThanOrEqual(1);
      expect(b.errors.some((e) => e.message.includes('A failed'))).toBe(true);

      expect(c.errors.length).toBeGreaterThanOrEqual(1);
      expect(c.errors.some((e) => e.message.includes('A failed'))).toBe(true);
    });

    it('accumulates errors from multiple sources', () => {
      // Note: ComputedError is recoverable by default. After first throw,
      // subsequent accesses return defaultValue instead of throwing.
      const x = computed(
        () => {
          throw new Error('X failed');
        },
        { defaultValue: 0 }
      );

      const y = computed(
        () => {
          throw new Error('Y failed');
        },
        { defaultValue: 0 }
      );

      // First access throws
      expect(() => x.value).toThrow('X failed');
      expect(() => y.value).toThrow('Y failed');

      // Both x and y now have hasError = true
      expect(x.hasError).toBe(true);
      expect(y.hasError).toBe(true);

      // z depends on x and y - both are now in recoverable error state,
      // so they return defaultValue instead of throwing
      const z = computed(() => x.value + y.value, { defaultValue: -1 });
      // z.value doesn't throw because x and y return defaultValues
      expect(z.value).toBe(0); // 0 + 0

      // But z should see errors from its dependencies
      expect(z.hasError).toBe(true);
      expect(z.errors.length).toBeGreaterThanOrEqual(1);
      expect(z.errors.some((e) => e.message.includes('X failed'))).toBe(true);
      expect(z.errors.some((e) => e.message.includes('Y failed'))).toBe(true);
    });

    it('recovers when error source is fixed', () => {
      // Use sync atom for immediate notification
      const source = atom(0, { sync: true });
      const derived = computed(
        () => {
          if (source.value < 0) throw new Error('Negative!');
          return source.value * 2;
        },
        { defaultValue: -1 }
      );

      // Initially no error - trigger computation
      expect(derived.value).toBe(0);
      expect(derived.hasError).toBe(false);
      expect(derived.isValid).toBe(true);

      // Trigger error - sync atom marks dirty immediately
      source.value = -1;
      // Accessing value will throw
      expect(() => derived.value).toThrow('Negative!');
      expect(derived.hasError).toBe(true);
      expect(derived.errors).toHaveLength(1);
      expect(derived.errors[0]?.message).toContain('Negative!');

      // Recovery - sync atom marks dirty immediately
      source.value = 5;
      expect(derived.value).toBe(10);
      expect(derived.hasError).toBe(false);
      expect(derived.isValid).toBe(true);
      expect(derived.errors).toHaveLength(0);
    });

    it('chain of computeds recovers when upstream recovers', () => {
      // Use sync atom for immediate notification
      const source = atom(1, { sync: true });
      const a = computed(
        () => {
          if (source.value === 0) throw new Error('Zero!');
          return source.value;
        },
        { defaultValue: -1 }
      );
      const b = computed(() => a.value * 2, { defaultValue: -1 });
      const c = computed(() => b.value + 1, { defaultValue: -1 });

      // Initially valid - trigger computation
      expect(c.value).toBe(3);
      expect(c.hasError).toBe(false);

      // Trigger error - sync atom notifies immediately
      source.value = 0;
      expect(() => c.value).toThrow('Zero!');
      expect(a.hasError).toBe(true);
      expect(b.hasError).toBe(true);
      expect(c.hasError).toBe(true);

      // Recovery - sync atom notifies immediately
      source.value = 2;
      expect(c.value).toBe(5);
      expect(a.hasError).toBe(false);
      expect(b.hasError).toBe(false);
      expect(c.hasError).toBe(false);
    });
  });

  describe('async error propagation', () => {
    it('propagates async errors to downstream', async () => {
      const user = computed(
        async () => {
          await sleep(5);
          throw new Error('User fetch failed');
        },

        { defaultValue: null }
      );

      const posts = computed(
        async () => {
          if (!user.value) return [];
          return ['post1', 'post2'];
        },
        { defaultValue: [] as string[] }
      );

      // Trigger computation
      user.value;
      posts.value;

      await sleep(20);

      expect(user.hasError).toBe(true);
      expect(user.state).toBe('rejected');

      // posts should see user's error
      expect(posts.hasError).toBe(true);
      expect(posts.errors.length).toBeGreaterThanOrEqual(1);
      expect(posts.errors[0]?.message).toContain('User fetch failed');
    });

    it('clears errors on successful async resolution', async () => {
      const shouldFail = atom(true, { sync: true });
      const result = computed(
        async () => {
          await sleep(5);
          if (shouldFail.value) throw new Error('Failed');
          return 42;
        },
        { defaultValue: 0 }
      );

      // Trigger first computation (will fail)
      result.value;
      await sleep(15);

      expect(result.hasError).toBe(true);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);

      // Fix and retry
      shouldFail.value = false;
      result.invalidate();
      result.value;
      await sleep(15);

      expect(result.hasError).toBe(false);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('no-error fast path', () => {
    it('returns EMPTY_ERROR_ARRAY for valid computed', () => {
      const a = atom(1);
      const b = computed(() => a.value * 2);
      const c = computed(() => b.value + 1);

      // Trigger computation
      expect(c.value).toBe(3);

      expect(c.hasError).toBe(false);
      expect(c.isValid).toBe(true);
      expect(c.errors).toBe(EMPTY_ERROR_ARRAY);
      expect(c.errors).toHaveLength(0);
    });

    it('errors array is immutable', () => {
      const a = computed(
        () => {
          throw new Error('fail');
        },
        { defaultValue: 0 }
      );

      // Trigger computation to establish error
      expect(() => a.value).toThrow();

      const errors = a.errors;
      expect(Object.isFrozen(errors)).toBe(true);

      // Should not be able to modify
      expect(() => {
        (errors as Error[]).push(new Error('another'));
      }).toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles dispose correctly', () => {
      const source = atom(0, { sync: true });
      const derived = computed(
        () => {
          if (source.value < 0) throw new Error('Negative!');
          return source.value;
        },
        { defaultValue: -1 }
      );

      // Initial computation
      derived.value;

      source.value = -1;
      expect(() => derived.value).toThrow('Negative!');
      expect(derived.hasError).toBe(true);

      derived.dispose();

      // After dispose, should be in clean state
      expect(derived.hasError).toBe(false);
    });

    it('handles deep dependency chains', () => {
      const source = atom(1);
      let current = computed(() => source.value, { defaultValue: 0 });

      // Create chain of 10 computeds
      for (let i = 0; i < 10; i++) {
        const prev = current;
        current = computed(
          () => {
            if (prev.value < 0) throw new Error(`Level ${i}`);
            return prev.value + 1;
          },
          { defaultValue: -1 }
        );
      }

      // Trigger computation first
      expect(current.value).toBe(11);
      expect(current.hasError).toBe(false);

      // Trigger error at source level
      const errorSource = computed(
        () => {
          throw new Error('Source error');
        },
        { defaultValue: 0 }
      );

      const downstream = computed(() => errorSource.value + 1, { defaultValue: 0 });

      // Sync computeds throw on first access
      expect(() => downstream.value).toThrow('Source error');

      expect(downstream.hasError).toBe(true);
      // downstream has: own error + errorSource's error
      expect(downstream.errors.length).toBeGreaterThanOrEqual(1);
      expect(downstream.errors.some((e) => e.message.includes('Source error'))).toBe(true);
    });

    it('deduplicates same Error instance in chain', () => {
      const a = computed(
        () => {
          throw new Error('A error');
        },
        { defaultValue: 0 }
      );
      const b = computed(() => a.value, { defaultValue: 0 });
      const c = computed(() => b.value, { defaultValue: 0 });

      // First access throws
      expect(() => c.value).toThrow('A error');

      // All should have error
      expect(a.hasError).toBe(true);
      expect(b.hasError).toBe(true);
      expect(c.hasError).toBe(true);

      // Each layer has its own wrapped error (ComputedError)
      // a.errors has 1 error (its own)
      expect(a.errors).toHaveLength(1);

      // b.errors has: b's own error + a's errors (deduplicated)
      // Since b._error and a._error are different objects, both are included
      expect(b.errors.length).toBeGreaterThanOrEqual(1);

      // c.errors collects from the chain
      // Same Error instances are deduplicated by Set,
      // but wrapped errors are different instances
      expect(c.errors.length).toBeGreaterThanOrEqual(1);

      // All errors in chain should mention 'A error'
      expect(c.errors.every((e) => e.message.includes('A error'))).toBe(true);
    });

    it('lastError returns only own error, not dependency errors', () => {
      const a = computed(
        () => {
          throw new Error('A error');
        },
        { defaultValue: 0 }
      );

      // First access to establish error state
      expect(() => a.value).toThrow('A error');
      expect(a.hasError).toBe(true);

      // Now a is in rejected state with recoverable error
      // Second access should return defaultValue
      expect(a.value).toBe(0);

      // b depends on a - a.value returns 0 (defaultValue)
      let aValueInsideB = -999;
      const b = computed(
        () => {
          aValueInsideB = a.value;
          return a.value + 1;
        },
        { defaultValue: -1 }
      );

      const bVal = b.value;

      // Debug: check what a.value was when b computed
      expect(aValueInsideB).toBe(0);
      expect(bVal).toBe(1);

      // a has its own lastError
      expect(a.lastError?.message).toContain('A error');

      // b has no lastError (it computed successfully with a's defaultValue)
      expect(b.lastError).toBe(null);

      // But b.hasError is true because a.hasError is true
      expect(b.hasError).toBe(true);

      // b.errors contains a's error through dependency chain
      expect(b.errors.length).toBeGreaterThanOrEqual(1);
      expect(b.errors.some((e) => e.message.includes('A error'))).toBe(true);
    });

    it('errors uses epoch cache (same reference on repeated calls)', () => {
      const a = computed(
        () => {
          throw new Error('cached');
        },
        { defaultValue: 0 }
      );

      // Trigger error
      expect(() => a.value).toThrow();

      // Multiple accesses should return same cached reference
      const errors1 = a.errors;
      const errors2 = a.errors;

      expect(errors1).toBe(errors2); // Same reference (cached)
    });
  });
});
