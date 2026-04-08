/**
 * @fileoverview Atom Behavior Tests
 * @description Verifies core behaviors including state management, subscription lifecycle,
 * and resource safety while minimizing dependency on internal implementation details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { atom, batch, scheduler } from '@/index';
import { waitForScheduler } from '../../utils/test-helpers';

describe('Atom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  interface InternalAtom {
    version: number;
    isNotificationScheduled: boolean;
  }

  describe('State Management & Updates', () => {
    it('initializes with value and updates version only on change', () => {
      const a = atom(0);
      const v0 = (a as unknown as InternalAtom).version;

      expect(a.value).toBe(0);

      // Value change
      a.value = 1;
      expect(a.value).toBe(1);
      expect((a as unknown as InternalAtom).version).toBe(v0 + 1);

      // Same value assignment (Object.is)
      const v1 = (a as unknown as InternalAtom).version;
      a.value = 1;
      expect((a as unknown as InternalAtom).version).toBe(v1); // No version bump
    });

    it('defers notifications and batches rapid updates by default', async () => {
      const a = atom(0);
      const log: Array<[number | undefined, number | undefined]> = [];

      a.subscribe((nv, ov) => log.push([nv, ov]));

      a.value = 1;
      expect(log).toHaveLength(0); // Still async

      a.value = 2;
      a.value = 3;
      await waitForScheduler();

      // Should batch rapid updates into one notification
      expect(log).toEqual([[3, 0]]);
    });

    it('supports immediate synchronous notifications', () => {
      const a = atom(0, { sync: true });
      const spy = vi.fn();
      a.subscribe(spy);

      a.value = 1;
      expect(spy).toHaveBeenCalledWith(1, 0);

      // Suppressed during manual scheduler batch
      scheduler.startBatch();
      a.value = 2;
      a.value = 3;
      expect(spy).toHaveBeenCalledTimes(1); // Still 1

      scheduler.endBatch();
      expect(spy).toHaveBeenCalledTimes(2); // Final value synced
    });

    it('peek() returns current value synchronously without tracking', () => {
      const a = atom(7);
      expect(a.peek()).toBe(7);
      a.value = 8;
      expect(a.peek()).toBe(8);
    });
  });

  describe('Subscription Lifecycle', () => {
    it('manages counts, duplicate warnings, and unsubscription idempotently', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const a = atom(0);
      const fn = vi.fn();

      const unsub1 = a.subscribe(fn);
      expect(a.subscriberCount()).toBe(1);

      // Duplicates should warn and be ignored logic-wise
      const unsub2 = a.subscribe(fn);
      expect(warnSpy).toHaveBeenCalled();
      expect(a.subscriberCount()).toBe(1);

      unsub1();
      expect(a.subscriberCount()).toBe(0);
      expect(() => unsub2()).not.toThrow(); // Safe double unsubscribe
    });

    it('supports both function and object subscribers', async () => {
      const a = atom(0);
      const fnCalls: number[] = [];
      const objCalls: number[] = [];

      a.subscribe((val) => fnCalls.push(val!));
      a.subscribe({ execute: () => objCalls.push(a.peek()) });

      a.value = 5;
      await waitForScheduler();

      expect(fnCalls).toEqual([5]);
      expect(objCalls).toEqual([5]);
    });

    it('isolates subscriber errors to ensure peer notification', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      const bad = () => {
        throw new Error('fail');
      };
      const good = vi.fn();

      a.subscribe(bad);
      a.subscribe(good);

      a.value = 1;
      await waitForScheduler();

      expect(good).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('concurrent unsubscribe prevents notification in current batch', () => {
      const a = atom(0, { sync: true });
      const calls: string[] = [];
      let unsub2: () => void;

      a.subscribe(() => {
        calls.push('first');
        unsub2();
      });
      unsub2 = a.subscribe(() => calls.push('second'));

      a.value = 1;
      expect(calls).toEqual(['first']);
    });
  });

  describe('Lifecycle & Resource Safety', () => {
    it('rigidly cleans up on disposal and supports Symbol.dispose', () => {
      const a = atom(100);
      const spy = vi.fn();
      a.subscribe(spy);

      a.dispose();
      a[Symbol.dispose](); // Idempotent

      expect(a.subscriberCount()).toBe(0);
      expect(a.value).toBeUndefined(); // Resource released

      a.value = 200;
      expect(spy).not.toHaveBeenCalled();
    });

    it('prevents stack overflow on recursive sync updates', () => {
      const a = atom(0, { sync: true });
      let count = 0;
      a.subscribe((val) => {
        count++;
        if (val! < 10) a.value = val! + 1;
      });

      a.value = 1;
      expect(count).toBe(10); // Correctly converted recursion to iteration
    });

    it('ensures notification flags are cleared even if subscriber throws', async () => {
      const a = atom(0);
      a.subscribe(() => {
        throw new Error('Expected');
      });

      a.value = 1;
      await waitForScheduler();

      // Internals should be consistent
      expect((a as unknown as InternalAtom).isNotificationScheduled).toBe(false);
    });

    it('suppresses notification if value reverts to original within a batch', async () => {
      const a = atom(0);
      const spy = vi.fn();
      a.subscribe(spy);

      batch(() => {
        a.value = 1;
        a.value = 0; // Revert
      });

      await waitForScheduler();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
