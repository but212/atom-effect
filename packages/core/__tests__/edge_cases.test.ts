import { afterEach, describe, expect, it, vi } from 'vitest';
import { atom, batch, computed, effect, untracked } from '../src';
import { sleep, waitForScheduler } from './utils/test-helpers';

describe('Reactive Core - Edge Cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Conditional Dependencies (Dynamic Graph)', () => {
    it('prunes unused dependencies on branch switch', async () => {
      const toggle = atom(true);
      const a = atom('A');
      const b = atom('B');

      let computations = 0;
      const result = computed(() => {
        computations++;
        return toggle.value ? a.value : b.value;
      });

      expect(result.value).toBe('A');
      expect(computations).toBe(1);

      // b is not a dependency while toggle is true
      b.value = 'B2';
      await waitForScheduler();
      expect(result.value).toBe('A');
      expect(computations).toBe(1);

      // Switch branch: b becomes dependency, a is pruned
      toggle.value = false;
      await waitForScheduler();
      expect(result.value).toBe('B2');
      expect(computations).toBe(2);

      // a no longer triggers recompute
      a.value = 'A2';
      await waitForScheduler();
      expect(result.value).toBe('B2');
      expect(computations).toBe(2);

      // b triggers recompute
      b.value = 'B3';
      await waitForScheduler();
      expect(result.value).toBe('B3');
      expect(computations).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('captures errors in effect onError handler', async () => {
      const trigger = atom(0);
      const onError = vi.fn();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      effect(
        () => {
          if (trigger.value === 1) {
            throw new Error('Effect Boom');
          }
        },
        { onError }
      );

      trigger.value = 1;
      await waitForScheduler();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0]?.message).toContain('Effect Boom');
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Nested Batching', () => {
    it('only notifies after outermost batch completes', async () => {
      const a = atom(0);
      const b = atom(0);
      const listener = vi.fn();

      effect(() => {
        listener(a.value, b.value);
      });

      listener.mockClear();

      batch(() => {
        a.value = 1;
        batch(() => {
          b.value = 2;
          a.value = 3;
        });
        b.value = 4;
      });

      await waitForScheduler();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(3, 4);
    });
  });

  describe('Async Computed Drift (Race Conditions)', () => {
    it('handles rapid updates by respecting the latest dependency version', async () => {
      const source = atom(0);
      const results: number[] = [];

      const asyncDerived = computed(
        async () => {
          const val = source.value;
          await sleep(20);
          return val;
        },
        { defaultValue: -1 }
      );

      effect(() => {
        results.push(asyncDerived.value);
      });

      await sleep(30);
      expect(results).toContain(0);
      results.length = 0;

      // Rapid updates
      source.value = 1;
      sleep(5).then(() => {
        source.value = 2;
      });
      sleep(10).then(() => {
        source.value = 3;
      });

      await sleep(100);

      expect(asyncDerived.value).toBe(3);
      expect(results[results.length - 1]).toBe(3);
    });
  });

  describe('Diamond Dependency (A->B,C->D)', () => {
    it('notifies only once when shared source changes', async () => {
      const a = atom(1);
      const b = computed(() => a.value * 2);
      const c = computed(() => a.value * 3);
      const d = computed(() => b.value + c.value);
      const listener = vi.fn();
      d.subscribe(listener);

      expect(d.value).toBe(5);

      a.value = 2;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(d.value).toBe(10);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Untracked Reads', () => {
    it('does not recompute when untracked dependency changes', () => {
      const a = atom(1);
      const b = atom(2);
      const c = computed(() => a.value + untracked(() => b.value));

      expect(c.value).toBe(3);
      b.value = 10;
      expect(c.value).toBe(3);
    });
  });

  describe('Equality Checks', () => {
    it('skips updates if values are equal (Object.is)', async () => {
      const count = atom(10);
      const listener = vi.fn();

      effect(() => {
        listener(count.value);
      });

      await waitForScheduler();
      expect(listener).toHaveBeenCalledTimes(1);

      count.value = 10;
      await waitForScheduler();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('uses custom equality to suppress version bumps', async () => {
      const count = atom({ id: 1, val: 10 });
      const derived = computed(() => count.value, {
        equal: (a, b) => a.id === b.id,
      });

      // Initial value
      expect(derived.value).toEqual({ id: 1, val: 10 });

      // Update with same id but different val
      count.value = { id: 1, val: 20 };
      await waitForScheduler();

      // Custom equal treats same-id objects as equal, so version should not bump
      // The derived value may or may not update depending on implementation,
      // but the version should remain unchanged (no downstream notification)
      // biome-ignore lint/suspicious/noExplicitAny: accessing internal version property
      const getVersion = (d: any) => d.version;
      const versionBefore = getVersion(derived);

      count.value = { id: 1, val: 30 };
      await waitForScheduler();

      expect(getVersion(derived)).toBe(versionBefore);
    });
  });
});
