/**
 * @fileoverview Computed Behavior Tests
 * @description Refined test suite focusing on core behaviors: Lazy evaluation, Caching, and Error Handling.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AtomError,
  aeNextTick,
  atom,
  ComputedError,
  computed,
  effect,
  isComputed,
  mergeAtoms,
} from '@/index';
import { sleep } from '../../utils/test-helpers';

describe('Computed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Core Mechanics', () => {
    it('should initialize correctly and reject invalid arguments', () => {
      const c = computed(() => 1);
      expect(isComputed(c)).toBe(true);
      expect(c).toBeDefined();

      // Invalid arguments validation
      expect(() => computed(null as unknown as () => void)).toThrow(ComputedError);
      expect(() => c.subscribe(null as unknown as () => void)).toThrow(AtomError);
    });

    it('should evaluate lazily and cache results', async () => {
      const src = atom(1);
      const fn = vi.fn(() => src.value * 2);
      const c = computed(fn);

      // Lazy: not called on creation
      expect(fn).not.toHaveBeenCalled();

      // First evaluation
      expect(c.value).toBe(2);
      expect(fn).toHaveBeenCalledTimes(1);

      // Cached: subsequent reads do not trigger compute function
      c.value;
      c.value;
      expect(fn).toHaveBeenCalledTimes(1);

      // Recompute: only after dependency change and subsequent re-access
      src.value = 5;
      await aeNextTick();
      expect(fn).toHaveBeenCalledTimes(1); // Still cached until explicitly read
      expect(c.value).toBe(10);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect equality checks to prune recomputations', async () => {
      const src = atom({ x: 1 });
      const fn = vi.fn(() => ({ x: src.value.x }));
      const c = computed(fn, {
        equal: (a, b) => a.x === b.x,
      });

      c.value; // initialize
      const spy = vi.fn();
      effect(() => {
        c.value;
        spy();
      });
      spy.mockClear();

      src.value = { x: 1 }; // Structurally different, logically same
      await aeNextTick();

      expect(c.value).toEqual({ x: 1 });
      expect(fn).toHaveBeenCalledTimes(2); // Re-evaluation occurs to check equality
      expect(spy).not.toHaveBeenCalled(); // Effect skipped because result was "equal"
    });
  });

  describe('Error Handling', () => {
    it('should capture and expose computation errors', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const c = computed(
        () => {
          throw new Error('computation_failed');
        },
        {
          onError: () => {
            throw new Error('handler_failed');
          },
        }
      );

      expect(() => c.value).toThrow(ComputedError);
      expect(c.hasError).toBe(true);
      expect(c.lastError?.message).toContain('computation_failed');
      expect(consoleError).toHaveBeenCalled(); // Internal handler error caught
    });
  });

  describe('Asynchronous Flows', () => {
    it('should manage pending states and default values', async () => {
      const c = computed(
        async () => {
          await sleep(20);
          return 'resolved';
        },
        { defaultValue: 'loading' }
      );

      expect(c.value).toBe('loading');
      expect(c.isPending).toBe(true);

      await sleep(30);
      expect(c.value).toBe('resolved');
      expect(c.isResolved).toBe(true);
    });

    it('should resolve race conditions by preferring the latest request', async () => {
      const trigger = atom(0);
      const c = computed(
        async () => {
          const v = trigger.value;
          await sleep(v === 0 ? 50 : 10);
          return v;
        },
        { defaultValue: -1 }
      );

      c.value; // Request 0
      trigger.value = 1;
      await sleep(5);
      c.value; // Request 1

      await sleep(60);
      expect(c.value).toBe(1); // Latest request wins
    });

    it('should enforce single-microtask resolution consistency', async () => {
      let resolvePromise!: (v: string) => void;
      const promise = new Promise<string>((r) => {
        resolvePromise = r;
      });

      const c = computed(() => promise, { defaultValue: 'loading' });

      expect(c.value).toBe('loading');
      resolvePromise('done');

      // Check: Should be resolved in the very next microtask
      await Promise.resolve();

      expect(c.isResolved).toBe(true);
      expect(c.value).toBe('done');
    });

    it('should throw if accessed during pending state without default value', async () => {
      const p = computed(async () => {
        await sleep(10);
        return 1;
      });
      expect(() => p.value).toThrow(ComputedError);
    });
  });

  describe('Reactive Integrity', () => {
    it('should maintain chain reactivity and cleanup on dispose', async () => {
      const a = atom(1);
      const b = computed(() => a.value + 1);
      const c = computed(() => b.value * 2);

      expect(c.value).toBe(4);

      const spy = vi.fn();
      const unsub = c.subscribe(spy);
      expect(c.subscriberCount()).toBe(1);

      a.value = 5;
      await aeNextTick();
      expect(spy).toHaveBeenCalled();
      expect(c.value).toBe(12);

      c.dispose();
      expect(() => c.value).toThrow(ComputedError);
      expect(c.subscriberCount()).toBe(0);
      unsub();
    });

    it('should clear internal references in unsubscribe returned closure to prevent memory leaks', () => {
      const src = atom(1);
      const c = computed(() => src.value * 2);
      const spy = vi.fn();
      const unsub = c.subscribe(spy);

      expect(c.subscriberCount()).toBe(1);
      unsub();
      expect(c.subscriberCount()).toBe(0);

      // Verify calling unsubscribe again does not throw or cause issues
      expect(() => unsub()).not.toThrow();
    });

    it('should prevent dependency leakage through meta-state access', () => {
      const dep = atom(0);
      const child = computed(() => dep.value);
      const parent = computed(() => child.hasError);

      const spy = vi.fn();
      const tracker = computed(() => parent.hasError);
      tracker.subscribe(spy);
      tracker.value;

      dep.value = 1; // child changes, but parent.hasError is still false
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Advanced Composition: Object Merging', () => {
    it('should merge multiple atoms into an intersected object', () => {
      const a = atom({ id: 1, name: 'Atom A' });
      const b = atom({ version: '1.0.0', tags: ['core'] });
      const merged = mergeAtoms(a, b);

      expect(merged.value).toEqual({
        id: 1,
        name: 'Atom A',
        version: '1.0.0',
        tags: ['core'],
      });
    });

    it('should respect merge priority (last atom wins on key collision)', () => {
      const a = atom({ x: 1, y: 1 });
      const b = atom({ y: 2, z: 3 });
      const merged = mergeAtoms(a, b);

      expect(merged.value).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('should reactively update when any source atom changes', async () => {
      const a = atom({ x: 1 });
      const b = atom({ y: 1 });
      const merged = mergeAtoms(a, b);

      const spy = vi.fn();
      effect(() => {
        spy(merged.value);
      });
      spy.mockClear();

      a.value = { x: 10 };
      await aeNextTick();
      expect(spy).toHaveBeenCalledWith({ x: 10, y: 1 });

      b.value = { y: 20 };
      await aeNextTick();
      expect(spy).toHaveBeenCalledWith({ x: 10, y: 20 });
    });

    it('should support mixed source types (Atoms and Computed)', async () => {
      const base = atom(100);
      const a = computed(() => ({ val: base.value }));
      const b = atom({ active: true });
      const merged = mergeAtoms(a, b);

      expect(merged.value).toEqual({ val: 100, active: true });

      base.value = 200;
      await aeNextTick();
      expect(merged.value).toEqual({ val: 200, active: true });
    });
  });
});
