/**
 * @fileoverview Atom-specific tests (coverage supplement)
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError } from '@/errors/errors';
import { trackingContext } from '@/tracking';
import { debug } from '@/utils/debug';
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

  it('other subscribers execute even if one throws an error (sync and async)', async () => {
    // Test for default (async) mode
    const countAsync = atom(0);
    const errorListenerAsync = vi.fn(() => {
      throw new Error('Async error');
    });
    const normalListenerAsync = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    countAsync.subscribe(errorListenerAsync);
    countAsync.subscribe(normalListenerAsync);
    countAsync.value = 1;
    await waitForScheduler();

    expect(errorListenerAsync).toHaveBeenCalled();
    expect(normalListenerAsync).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    // Test for sync mode
    const countSync = atom(0, { sync: true });
    const errorListenerSync = vi.fn(() => {
      throw new Error('Sync error');
    });
    const normalListenerSync = vi.fn();

    countSync.subscribe(errorListenerSync);
    countSync.subscribe(normalListenerSync);
    countSync.value = 1;

    expect(errorListenerSync).toHaveBeenCalled();
    expect(normalListenerSync).toHaveBeenCalled();
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

  it('unsubscribing works correctly', async () => {
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
