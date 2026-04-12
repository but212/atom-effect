/**
 * @fileoverview Atom Behavior Tests
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { scheduler } from '@/core/scheduler';
import { AtomError } from '@/errors';
import { waitForScheduler } from '../../utils/test-helpers';

describe('Atom', () => {
  it('should manage lifecycle: creation, non-reactive read, and disposal', () => {
    const a = atom(42);
    const spy = vi.fn();
    a.subscribe(spy);

    expect(a.value).toBe(42);
    expect(a.peek()).toBe(42);

    a.dispose();
    a.value = 99; // Update after disposal
    expect(a.subscriberCount()).toBe(0);
    expect(spy).not.toHaveBeenCalled();

    // Invalid subscribers
    expect(() => a.subscribe(null as unknown as () => void)).toThrow(AtomError);
  });

  describe('Notification Policy (Async)', () => {
    it('should optimize notifications via batching, identity check, and net-zero guard', async () => {
      const a = atom(0);
      const spy = vi.fn();
      a.subscribe(spy);

      // 1. Batching & Identity protection
      a.value = 1;
      a.value = 1; // Same value -> ignored
      a.value = 2;
      await waitForScheduler();
      expect(spy).toHaveBeenCalledWith(2, 0);
      spy.mockClear();

      // 2. Net-Zero Guard (returns to original value in batch)
      a.value = 3; // value=3, pending=2
      scheduler.startBatch();
      a.value = 4;
      a.value = 2; // Return to 2
      scheduler.endBatch();

      await waitForScheduler();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should handle special equality cases (NaN, -0)', async () => {
      const a = atom(NaN);
      const spy = vi.fn();
      a.subscribe(spy);

      a.value = NaN; // ignored
      await waitForScheduler();
      expect(spy).not.toHaveBeenCalled();

      a.value = 0;
      a.value = -0; // +0 vs -0 are distinct
      await waitForScheduler();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Synchronous Contract', () => {
    it('should notify immediately and maintain order during re-entrancy', () => {
      const a = atom(1, { sync: true });
      const log: string[] = [];

      a.subscribe((nv, ov) => {
        log.push(`sub1: ${ov} -> ${nv}`);
        if (nv === 2) a.value = 3; // Re-entry
      });
      a.subscribe((nv, ov) => log.push(`sub2: ${ov} -> ${nv}`));

      a.value = 2; // Trigger

      // Breadth-First notification ensures correct order
      expect(log).toEqual(['sub1: 1 -> 2', 'sub2: 1 -> 2', 'sub1: 2 -> 3', 'sub2: 2 -> 3']);
    });
  });

  describe('Reliability', () => {
    it('should isolate subscriber errors to prevent chain collapse', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      const good = vi.fn();

      a.subscribe(() => {
        throw new Error('boom');
      });
      a.subscribe(good);

      a.value = 1;
      await waitForScheduler();

      expect(good).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
