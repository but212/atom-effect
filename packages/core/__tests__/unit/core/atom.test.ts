/**
 * @fileoverview Atom Behavior Tests
 * @description Verifies validation, state management, lifecycle, and subscription handling.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { AtomError } from '@/errors/errors';
import { waitForScheduler } from '../../utils/test-helpers';

describe('Atom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Validation & Safety', () => {
    it('rejects invalid inputs', () => {
      const a = atom(0);
      expect(() => a.subscribe(null as unknown as () => void)).toThrow(AtomError);
      expect(() => a.subscribe('invalid' as unknown as () => void)).toThrow(AtomError);
    });

    it('warns on duplicate subscriptions', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const a = atom(0);
      const fn = () => {};

      const unsub1 = a.subscribe(fn);
      expect(consoleWarn).not.toHaveBeenCalled();

      const unsub2 = a.subscribe(fn);
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('Duplicate'));

      unsub1(); // Should work
      unsub2(); // Should be no-op
      consoleWarn.mockRestore();
    });
  });

  describe('State & Lifecycle', () => {
    it('manages value updates and version consistency', async () => {
      const a = atom(0);
      const log: number[] = [];
      a.subscribe((v) => v !== undefined && log.push(v));

      a.value = 1;
      a.value = 2;
      a.value = 3;

      await waitForScheduler();

      // Should only reflect final state (async batching)
      expect(log).toEqual([3]);
    });

    it('supports synchronous updates', () => {
      const a = atom(0, { sync: true });
      const log: number[] = [];
      a.subscribe((v) => v !== undefined && log.push(v));

      a.value = 1;
      a.value = 2;

      // Sync updates happen immediately
      expect(log).toEqual([1, 2]);
    });

    it('clears value on dispose', () => {
      const a = atom(10);
      expect(a.peek()).toBe(10);
      a.dispose();
      expect(a.peek()).toBe(undefined);
    });
  });

  describe('Subscription Management', () => {
    it('handles subscribe and idempotent unsubscribe', async () => {
      const a = atom(0);
      const spy = vi.fn();

      const unsub = a.subscribe(spy);
      a.value = 1;
      await waitForScheduler();
      expect(spy).toHaveBeenCalledTimes(1);

      unsub();
      unsub(); // Idempotent

      a.value = 2;
      await waitForScheduler();
      expect(spy).toHaveBeenCalledTimes(1); // No new calls
    });

    it('supports object subscribers (Subscriber interface)', async () => {
      const a = atom(0);
      const spy = vi.fn();
      const subscriber = { execute: () => spy(a.peek()) };

      a.subscribe(subscriber);

      a.value = 1;
      await waitForScheduler();

      expect(spy).toHaveBeenCalledWith(1);
    });
  });
});
