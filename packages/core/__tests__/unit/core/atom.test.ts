/**
 * @fileoverview Atom Behavior Tests
 * @description Verifies validation, state management, lifecycle, and subscription handling.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { AtomError } from '@/errors/errors';
import { scheduler } from '@/internal/scheduler';
import { ATOM_BRAND } from '@/symbols';
import { waitForScheduler } from '../../utils/test-helpers';

describe('Atom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Identity, Validation & Initialization', () => {
    it('sets initial value, carries ATOM_BRAND, and rejects invalid subscribers', () => {
      const a = atom(42);
      expect(a.value).toBe(42);
      expect(atom(null).value).toBeNull();

      expect((a as unknown as Record<symbol, boolean>)[ATOM_BRAND]).toBe(true);

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
});
