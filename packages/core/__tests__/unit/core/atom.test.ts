/**
 * @fileoverview Atom-specific tests (coverage supplement)
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError } from '@/errors/errors';
import { debug } from '@/utils/debug';
import { trackingContext } from '@/tracking';
import { tick, waitForScheduler } from '../../utils/test-helpers';

describe('Atom - Error Handling and Edge Cases', () => {
  it('rejects invalid subscriber types', () => {
    const count = atom(0);

    expect(() => {
      count.subscribe(
        'not a function' as unknown as (newValue?: number, oldValue?: number) => void
      );
    }).toThrow(AtomError);

    expect(() => {
      count.subscribe(null as unknown as (newValue?: number, oldValue?: number) => void);
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
    await waitForScheduler();

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
    await waitForScheduler();

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

    await waitForScheduler();

    // Version management ensures only final value is reflected
    expect(calls[calls.length - 1]).toBe(3);
  });

  it('value is set to undefined after dispose', () => {
    const count = atom(10);
    count.dispose();

    expect(count.peek()).toBe(undefined);
  });

    it('efficiently manages multiple subscribers', async () => {
      const count = atom(0);
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      count.subscribe(listener1);
      const unsub2 = count.subscribe(listener2);
      unsub2();

      count.value = 1;
      await waitForScheduler();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
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
      await waitForScheduler();

      expect(normalListener).toHaveBeenCalled();
      expect(normalComputed.value).toBe(2);

      consoleError.mockRestore();
    });
  });

  describe('Debug and Tracking', () => {
    it('provides subscriberCount in debug mode', () => {
      const wasEnabled = debug.enabled;
      debug.enabled = true;

      const count = atom(0);
      const atomWithDebug = count as unknown as { subscriberCount?: () => number };
      
      if (atomWithDebug.subscriberCount) {
        expect(atomWithDebug.subscriberCount()).toBe(0);
        count.subscribe(vi.fn());
        expect(atomWithDebug.subscriberCount()).toBe(1);
      }

      debug.enabled = wasEnabled;
    });

    it('supports manual tracking via trackingContext', async () => {
      const a = atom(0);
      const listener = vi.fn();

      trackingContext.run(listener, () => {
        a.value;
      });

      a.value = 1;
      await tick();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('logs error when object subscriber throws', async () => {
      const a = atom(0);
      const tracker = {
        execute: () => {
          throw new Error('Object subscriber fail');
        },
      };

      trackingContext.run(tracker, () => {
        a.value;
      });

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      a.value = 1;
      await tick();

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
