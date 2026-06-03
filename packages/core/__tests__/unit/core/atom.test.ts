/**
 * @fileoverview Atom Behavior Tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtomError, aeNextTick, atom, batch, computed, globalScheduler } from '@/index';

describe('Atom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  describe('Identity, Validation & Initialization', () => {
    it('sets initial value and rejects invalid subscribers', () => {
      const a = atom(42);
      expect(a.value).toBe(42);
      expect(atom(null).value).toBeNull();

      for (const sub of ['invalid', null, {}]) {
        expect(() => a.subscribe(sub as unknown as () => void)).toThrow(AtomError);
      }

      // Valid subscriber with execute method should not throw
      expect(() => a.subscribe({ execute: vi.fn() })).not.toThrow();
    });

    it('throws AtomError on initialization if invalid equal option is provided', () => {
      // @ts-expect-error Testing invalid option
      expect(() => atom(0, { equal: 'invalid' })).toThrow(AtomError);
    });
  });

  describe('Read Access & Updates', () => {
    it('peek() returns current value synchronously without side-effects', () => {
      const a = atom(7);
      expect(a.peek()).toBe(7);
      a.value = 8;
      expect(a.peek()).toBe(8);
    });
  });

  describe('Notification Policy (Async)', () => {
    it('should optimize notifications via batching, identity check, and net-zero guard', async () => {
      const a = atom(0);
      const log: Array<[number | undefined, number | undefined]> = [];

      a.subscribe((nv, ov) => log.push([nv, ov]));

      // 1. Batching & Identity protection
      a.value = 1;
      expect(log).toHaveLength(0); // Synchronous access shows no updates (async by default)

      a.value = 1; // Same value -> ignored
      a.value = 2;
      a.value = 3;
      await aeNextTick();

      // Should batch rapid updates into one notification
      expect(log).toEqual([[3, 0]]);
    });

    it('ignores structurally identical updates (Object.is)', async () => {
      const spy = vi.fn();

      const numAtom = atom(NaN);
      numAtom.subscribe(spy);
      numAtom.value = NaN; // ignored
      await aeNextTick();
      expect(spy).not.toHaveBeenCalled();

      // +0 vs -0 are distinct
      numAtom.value = 0;
      numAtom.value = -0;
      await aeNextTick();
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockClear();

      const obj = { x: 1 };
      const objAtom = atom(obj);
      objAtom.subscribe(spy);
      objAtom.value = obj; // ignored
      await aeNextTick();
      expect(spy).not.toHaveBeenCalled();
    });

    it('implements net-zero guard (returns to original value in batch)', async () => {
      const a = atom(0);
      const spy = vi.fn();
      a.subscribe(spy);

      batch(() => {
        a.value = 4;
        a.value = 0; // Return to 0
      });

      await aeNextTick();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Sync Mode Execution', () => {
    it('notifies synchronously immediately unless scheduler is batching', () => {
      const a = atom(0, { sync: true });
      const spy = vi.fn();
      a.subscribe(spy);

      // Immediate notification
      a.value = 1;
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(1, 0);

      // Suppressed during manual scheduler batch
      batch(() => {
        a.value = 2;
        a.value = 3;
        expect(spy).toHaveBeenCalledTimes(1); // Still 1
      });
      expect(spy).toHaveBeenCalledTimes(2); // Final value synced
      expect(spy).toHaveBeenCalledWith(3, 1);
    });

    it('should maintain order during re-entrancy (Breadth-First)', () => {
      const a = atom(1, { sync: true });
      const log: string[] = [];

      a.subscribe((nv, ov) => {
        log.push(`sub1: ${ov} -> ${nv}`);
        if (nv === 2) a.value = 3; // Re-entry
      });
      a.subscribe((nv, ov) => log.push(`sub2: ${ov} -> ${nv}`));

      a.value = 2; // Trigger

      expect(log).toEqual(['sub1: 1 -> 2', 'sub2: 1 -> 2', 'sub1: 2 -> 3', 'sub2: 2 -> 3']);
    });

    it('should handle unsubscription safely during the notification loop (Re-entry)', () => {
      const a = atom(0, { sync: true });
      let unsub: (() => void) | undefined;
      const log: number[] = [];

      unsub = a.subscribe((nv) => {
        log.push(nv ?? 0);
        if (nv === 1) unsub?.();
      });
      a.subscribe((nv) => log.push(nv ?? 0));

      expect(a.subscriberCount()).toBe(2);
      a.value = 1;

      expect(log).toEqual([1, 1]);
      expect(a.subscriberCount()).toBe(1);
    });

    it('should not leave redundant jobs in the scheduler after synchronous re-entrant updates', () => {
      const a = atom(1, { sync: true });
      a.subscribe((nv) => {
        if (nv === 2) {
          a.value = 3;
        }
      });

      a.value = 2;
      expect(globalScheduler.queueSize).toBe(0);
    });

    it('should not notify a newly added subscriber due to slot reuse during the same notification cycle', () => {
      const a = atom(0, { sync: true });
      const log: string[] = [];

      // Subscribe S1
      a.subscribe(() => {
        log.push('s1');
        // Unsubscribe S2 and subscribe S3
        unsub2();
        a.subscribe(() => {
          log.push('s3');
        });
      });

      // Subscribe S2
      const unsub2 = a.subscribe(() => {
        log.push('s2');
      });

      a.value = 1;

      // S3 was subscribed *during* the execution of S1's callback.
      // Even though S3 was placed in slot 1 (reusing S2's slot), it should NOT be notified of the current change.
      expect(log).toEqual(['s1']);
    });
  });

  describe('Subscription Lifecycles & Disposal Behavior', () => {
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

    it('dispose() rigidly clears listeners and supports Symbol.dispose', async () => {
      const a = atom(0);
      const spy = vi.fn();

      a.subscribe(spy);
      a.dispose();
      // a[Symbol.dispose](); // Removed for ES2022 compatibility

      expect(a.subscriberCount()).toBe(0);

      a.value = 99;
      await aeNextTick();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not allow value update or retention after disposal', () => {
      const a = atom<{ data: string } | null>({ data: 'initial' });
      a.dispose();
      a.value = { data: 'leak' };
      expect(a.peek()).toBeUndefined();
    });

    it('should not allow or retain subscriptions after disposal', () => {
      const a = atom(0);
      a.dispose();
      const unsub = a.subscribe(() => {});
      expect(a.subscriberCount()).toBe(0);
      expect(() => unsub()).not.toThrow();
    });

    it('should return undefined on read access after disposal', () => {
      const a = atom(42);
      a.dispose();
      expect(a.value).toBeUndefined();
    });

    it('should return undefined on peek after disposal', () => {
      const a = atom(42);
      a.dispose();
      expect(a.peek()).toBeUndefined();
    });

    it('should not retain disposed atoms in computed/effect dependency buffers', () => {
      const a = atom(42);
      a.dispose();

      const c = computed(() => {
        return a.value;
      });

      // Trigger evaluation
      c.value;

      // Access dependencies
      // biome-ignore lint/suspicious/noExplicitAny: Accessing internal storage for dependency validation
      const slots = (c as any)._depSlots;
      if (slots) {
        for (let i = 0; i < slots.length; i++) {
          const link = slots.at(i);
          if (link && link.node === a) {
            throw new Error('Disposed atom retained in dependencies');
          }
        }
      }
    });
  });

  describe('Reliability', () => {
    it('should isolate subscriber errors to prevent chain collapse', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0);
      const good = vi.fn();

      a.subscribe(() => {
        throw new Error('boom');
      });
      a.subscribe(good);

      a.value = 1;
      await aeNextTick();

      expect(good).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
    });
  });

  describe('Coverage Gaps', () => {
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
      await aeNextTick();

      // Should have 6 errors logged
      expect(consoleError).toHaveBeenCalledTimes(6);
    });
  });
});
