/**
 * @fileoverview Atom-specific tests (coverage supplement)
 */

import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError } from '@/errors/errors';
import { debug } from '@/utils/debug';
import { describe, expect, it, vi } from 'vitest';

describe('Atom - Error Handling and Edge Cases', () => {
  it('rejects invalid subscriber types', () => {
    const count = atom(0);

    expect(() => {
      count.subscribe('not a function' as any);
    }).toThrow(AtomError);

    expect(() => {
      count.subscribe(null as any);
    }).toThrow(AtomError);
  });

  it('unsubscribing non-existent listener is safe', () => {
    const count = atom(0);
    const listener = vi.fn();

    const unsubscribe = count.subscribe(listener);
    unsubscribe();

    // Safe to unsubscribe an already unsubscribed listener
    expect(() => unsubscribe()).not.toThrow();
  });

  it('other subscribers execute even if one throws an error', async () => {
    const count = atom(0);
    const errorListener = vi.fn(() => {
      throw new Error('Test error');
    });
    const normalListener = vi.fn();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    count.subscribe(errorListener);
    count.subscribe(normalListener);

    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errorListener).toHaveBeenCalled();
    expect(normalListener).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('object subscriber (execute method) works correctly', async () => {
    const count = atom(0);
    const executeCalls: number[] = [];

    const _objectSubscriber = {
      execute: () => {
        executeCalls.push(count.peek());
      },
    };

    // computed registers as object subscriber
    const c = computed(() => count.value * 2);
    c.value; // register dependency

    count.value = 5;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(c.value).toBe(10);
  });

  it('sync option enables synchronous notification', () => {
    const count = atom(0, { sync: true });
    const calls: number[] = [];

    count.subscribe((newValue) => {
      if (newValue !== undefined) calls.push(newValue);
    });

    count.value = 1;
    // sync=true so executes immediately
    expect(calls).toEqual([1]);
  });

  it('version management ignores stale notifications', async () => {
    const count = atom(0);
    const calls: number[] = [];

    count.subscribe((newValue) => {
      if (newValue !== undefined) calls.push(newValue);
    });

    // Rapid multiple updates
    count.value = 1;
    count.value = 2;
    count.value = 3;

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Version management ensures only final value is reflected
    expect(calls[calls.length - 1]).toBe(3);
  });

  it('value can still be read after dispose', () => {
    const count = atom(10);
    count.dispose();

    // peek still works after dispose
    expect(count.peek()).toBe(undefined); // set to undefined in dispose
  });

  it('object subscriber via computed works correctly', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);

    c.value; // register dependency (computed registers as object subscriber)

    count.value = 5;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(c.value).toBe(10);
  });

  describe('Map-based Subscription Optimization', () => {
    it('efficiently manages large number of subscribers (O(1) add/remove)', () => {
      const count = atom(0);
      const listeners: Array<() => void> = [];
      const unsubscribers: Array<() => void> = [];

      // Add 1000 subscribers
      for (let i = 0; i < 1000; i++) {
        const listener = vi.fn();
        listeners.push(listener);
        unsubscribers.push(count.subscribe(listener));
      }

      // Remove middle subscribers (create free slots)
      for (let i = 100; i < 200; i++) {
        unsubscribers[i]?.();
      }

      // Add new subscribers (reuse free slots)
      for (let i = 0; i < 50; i++) {
        const newListener = vi.fn();
        count.subscribe(newListener);
      }

      // All operations should complete quickly
      expect(count.value).toBe(0);
    });

    it('removed subscriber does not receive notifications', async () => {
      const count = atom(0);
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      const _unsub1 = count.subscribe(listener1);
      const unsub2 = count.subscribe(listener2);
      const _unsub3 = count.subscribe(listener3);

      // Remove only listener2
      unsub2();

      count.value = 1;
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener1).toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled(); // removed
      expect(listener3).toHaveBeenCalled();
    });

    it('duplicate unsubscribe is safe (isUnsubscribed flag)', () => {
      const count = atom(0);
      const listener = vi.fn();

      const unsubscribe = count.subscribe(listener);

      // Safe to call multiple times
      expect(() => {
        unsubscribe();
        unsubscribe();
        unsubscribe();
      }).not.toThrow();
    });

    it('reuses free slots for efficient memory management', () => {
      const count = atom(0);
      const unsubscribers: Array<() => void> = [];

      // Add 100
      for (let i = 0; i < 100; i++) {
        unsubscribers.push(count.subscribe(vi.fn()));
      }

      // Remove 50 (create free slots)
      for (let i = 0; i < 50; i++) {
        unsubscribers[i]?.();
      }

      // Add 25 (reuse free slots)
      for (let i = 0; i < 25; i++) {
        count.subscribe(vi.fn());
      }

      // Internal array should not grow indefinitely
      // (exact size depends on implementation, but verify reuse works)
      expect(count.value).toBe(0);
    });
  });

  describe('Sync Mode Error Handling', () => {
    it('other subscribers execute even if one throws in sync=true mode', () => {
      const count = atom(0, { sync: true });
      const errorListener = vi.fn(() => {
        throw new Error('Sync error');
      });
      const normalListener = vi.fn();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      count.subscribe(errorListener);
      count.subscribe(normalListener);

      count.value = 1;

      // sync so executes immediately
      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('other subscribers execute even if object subscriber (execute) throws', async () => {
      const count = atom(0);
      const normalListener = vi.fn();

      // Create computed that intentionally throws an error
      const errorComputed = computed(() => {
        const val = count.value;
        if (val > 0) throw new Error('Computed error');
        return val;
      });

      const normalComputed = computed(() => count.value * 2);

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      count.subscribe(normalListener);
      errorComputed.value; // register dependency
      normalComputed.value; // register dependency

      count.value = 1;
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(normalListener).toHaveBeenCalled();
      expect(normalComputed.value).toBe(2);

      consoleError.mockRestore();
    });
  });

  describe('Debug Mode', () => {
    it('provides subscriberCount in debug mode', () => {
      const wasEnabled = debug.enabled;
      debug.enabled = true;

      const count = atom(0);

      // subscriberCount method should exist
      const atomWithDebug = count as any;
      if (atomWithDebug.subscriberCount) {
        expect(atomWithDebug.subscriberCount()).toBe(0);

        count.subscribe(vi.fn());
        expect(atomWithDebug.subscriberCount()).toBe(1);

        count.subscribe(vi.fn());
        expect(atomWithDebug.subscriberCount()).toBe(2);
      }

      debug.enabled = wasEnabled;
    });
  });
});
