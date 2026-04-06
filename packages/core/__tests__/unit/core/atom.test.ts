/**
 * @fileoverview Atom Behavior Tests
 * @description Verifies validation, state management, lifecycle, and subscription handling.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { scheduler } from '@/core/scheduler';
import { AtomError } from '@/errors';
import { waitForScheduler } from '../../utils/test-helpers';

describe('Atom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  interface InternalAtom {
    hasError: boolean;
    _deepDirtyCheck(): boolean;
    isSync: boolean;
    isNotificationScheduled: boolean;
    _flushNotifications(): void;
    dispose(): void;
  }

  describe('Identity, Validation & Initialization', () => {
    it('sets initial value and rejects invalid subscribers', () => {
      const a = atom(42);
      expect(a.value).toBe(42);
      expect(atom(null).value).toBeNull();

      ['invalid', null, {}].forEach((sub) => {
        expect(() => a.subscribe(sub as unknown as () => void)).toThrow(AtomError);
      });

      // Valid subscriber with execute method should not throw
      expect(() => a.subscribe({ execute: vi.fn() } as unknown as () => void)).not.toThrow();
    });
  });

  describe('Read Access & Updates', () => {
    it('peek() returns current value synchronously without side-effects', () => {
      const a = atom(7);
      expect(a.peek()).toBe(7);
      a.value = 8;
      expect(a.peek()).toBe(8);
    });

    it('defers notifications and batches rapid updates (Default Async Behaviors)', async () => {
      const a = atom(0);
      const log: Array<[number | undefined, number | undefined]> = [];

      a.subscribe((nv, ov) => log.push([nv, ov]));

      a.value = 1;
      expect(log).toHaveLength(0); // Synchronous access shows no updates

      a.value = 2;
      a.value = 3;
      await waitForScheduler();

      // Should batch rapid updates into one notification
      expect(log).toEqual([[3, 0]]);
    });

    it('ignores structurally identical updates (Object.is)', async () => {
      const spy = vi.fn();

      const numAtom = atom(NaN);
      numAtom.subscribe(spy);
      numAtom.value = NaN; // ignored
      await waitForScheduler();
      expect(spy).not.toHaveBeenCalled();

      // +0 vs -0 are distinct
      numAtom.value = 0;
      numAtom.value = -0;
      await waitForScheduler();
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockClear();

      const obj = { x: 1 };
      const objAtom = atom(obj);
      objAtom.subscribe(spy);
      objAtom.value = obj; // ignored
      await waitForScheduler();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Sync Mode Execution', () => {
    it('notifies synchronously immediately unless scheduler is batching', async () => {
      const a = atom(0, { sync: true });
      const spy = vi.fn();
      a.subscribe(spy);

      // Immediate notification
      a.value = 1;
      expect(spy).toHaveBeenCalledTimes(1);

      // Does not triple-fire after async scheduler flush
      await waitForScheduler();
      expect(spy).toHaveBeenCalledTimes(1);

      // Suppressed during manual scheduler batch
      scheduler.startBatch();
      a.value = 2;
      a.value = 3;
      expect(spy).toHaveBeenCalledTimes(1); // Still 1

      scheduler.endBatch();
      expect(spy).toHaveBeenCalledTimes(2); // Final value synced
    });
  });

  describe('Subscription Lifecycles & Dispositions', () => {
    it('manages counts, duplicate warnings, and unsubscription idempotently', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const a = atom(0);
      const fn = vi.fn();

      const unsub1 = a.subscribe(fn);
      expect(a.subscriberCount()).toBe(1);

      // Duplicates throw warning but act as no-op tracking-wise
      const unsub2 = a.subscribe(fn);
      expect(consoleWarn).toHaveBeenCalled();
      expect(a.subscriberCount()).toBe(1);

      unsub1();
      expect(a.subscriberCount()).toBe(0);
      expect(() => unsub2()).not.toThrow(); // Safe double unsubscribe
    });

    it('isolates subscriber errors so peers still execute', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);

      const bad = vi.fn().mockImplementation(() => {
        throw new Error('boom');
      });
      const good = vi.fn();

      a.subscribe(bad);
      a.subscribe(good);

      a.value = 1;
      await waitForScheduler();

      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
    });

    it('dispose() rigidly clears listeners and supports Symbol.dispose', async () => {
      const a = atom(0);
      const spy = vi.fn();

      a.subscribe(spy);
      a.dispose();
      a[Symbol.dispose](); // Double call is safe

      expect(a.subscriberCount()).toBe(0);

      a.value = 99;
      await waitForScheduler();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Coverage Gaps', () => {
    it('ReactiveNode base properties', () => {
      const a = atom(0) as unknown as InternalAtom;
      expect(a.hasError).toBe(false);
      expect(a._deepDirtyCheck()).toBe(false);
      expect(a.isSync).toBe(false);
      expect(a.isNotificationScheduled).toBe(false);

      const s = atom(0, { sync: true }) as unknown as InternalAtom;
      expect(s.isSync).toBe(true);
    });

    it('Duplicate subscription checks across all slots and overflow', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const a = atom(0);
      const f0 = () => {};
      const f1 = () => {};
      const f2 = () => {};
      const f3 = () => {};
      const f4 = () => {};
      const f5 = () => {};

      a.subscribe(f0);
      a.subscribe(f1);
      a.subscribe(f2);
      a.subscribe(f3);
      a.subscribe(f4);
      a.subscribe(f5);

      // Check duplicates for each slot
      a.subscribe(f0);
      expect(consoleWarn).toHaveBeenCalledTimes(1);
      a.subscribe(f1);
      expect(consoleWarn).toHaveBeenCalledTimes(2);
      a.subscribe(f2);
      expect(consoleWarn).toHaveBeenCalledTimes(3);
      a.subscribe(f3);
      expect(consoleWarn).toHaveBeenCalledTimes(4);
      a.subscribe(f4);
      expect(consoleWarn).toHaveBeenCalledTimes(5);
      a.subscribe(f5);
      expect(consoleWarn).toHaveBeenCalledTimes(6);
    });

    it('Subscriber error logging across all slots and overflow', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      const bad = (msg: string) => () => {
        throw new Error(msg);
      };

      // Fill all slots and overflow with UNIQUE bad subscribers to bypass duplicate checks
      // f0, f1, f2, f3 -> inline slots
      // f4, f5 -> overflow slots
      for (let i = 0; i < 6; i++) {
        a.subscribe(bad(`bad${i}`));
      }

      a.value = 1;
      await waitForScheduler();

      // Should have 6 errors logged
      expect(consoleError).toHaveBeenCalledTimes(6);
    });

    it('Internal _flushNotifications guards', () => {
      const a = atom(0) as unknown as InternalAtom;
      // Manually trigger flush when nothing is scheduled (line 95 in atom.ts)
      expect(() => a._flushNotifications()).not.toThrow();

      a.dispose();
      // Should return early if disposed
      expect(() => a._flushNotifications()).not.toThrow();
    });
  });
});
