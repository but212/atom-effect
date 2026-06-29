/**
 * @fileoverview Atom Behavior Tests
 */

import { describe, expect, it, vi } from 'vitest';
import { ATOM_STATE_FLAGS } from '@/constants';
import { AtomError, aeNextTick, atom, batch, computed, globalScheduler } from '@/index';

describe('Atom', () => {
  it('should manage lifecycle: creation, non-reactive read, and disposal', () => {
    const someAtom = atom(42);
    const spy = vi.fn();
    someAtom.subscribe(spy);

    expect(someAtom.value).toBe(42);
    expect(someAtom.peek()).toBe(42);

    someAtom.dispose();
    someAtom.value = 99; // Update after disposal
    expect(someAtom.subscriberCount()).toBe(0);
    expect(spy).not.toHaveBeenCalled();

    // @ts-expect-error Testing invalid subscriber
    expect(() => someAtom.subscribe(null)).toThrow(AtomError);
  });

  describe('atom() constructor', () => {
    it('sets initial value', () => {
      const someAtom = atom(42);
      expect(someAtom.value).toBe(42);
      expect(atom(null).value).toBeNull();
    });

    it('throws AtomError on initialization if invalid equal option is provided', () => {
      // @ts-expect-error Testing invalid option
      expect(() => atom(0, { equal: 'invalid' })).toThrow(AtomError);
    });
  });

  describe('value (getter/setter)', () => {
    describe('async mode (default)', () => {
      it('should optimize notifications via batching, identity check, and net-zero guard', async () => {
        const someAtom = atom(0);
        const notificationLog: Array<[number | undefined, number | undefined]> = [];

        someAtom.subscribe((newValue, oldValue) => notificationLog.push([newValue, oldValue]));

        someAtom.value = 1;
        expect(notificationLog).toHaveLength(0); // Async by default

        someAtom.value = 1; // Same value -> ignored
        someAtom.value = 2;
        someAtom.value = 3;
        await aeNextTick();

        // Should batch rapid updates into one notification
        expect(notificationLog).toEqual([[3, 0]]);
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

        const testObject = { x: 1 };
        const objAtom = atom(testObject);
        objAtom.subscribe(spy);
        objAtom.value = testObject; // ignored
        await aeNextTick();
        expect(spy).not.toHaveBeenCalled();
      });

      it('implements net-zero guard (returns to original value in batch)', async () => {
        const someAtom = atom(0);
        const spy = vi.fn();
        someAtom.subscribe(spy);

        batch(() => {
          someAtom.value = 4;
          someAtom.value = 0; // Return to 0
        });

        await aeNextTick();
        expect(spy).not.toHaveBeenCalled();
      });
    });

    describe('sync mode ({ sync: true })', () => {
      it('notifies synchronously immediately unless scheduler is batching', () => {
        const someAtom = atom(0, { sync: true });
        const spy = vi.fn();
        someAtom.subscribe(spy);

        // Immediate notification
        someAtom.value = 1;
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(1, 0);

        // Suppressed during manual scheduler batch
        batch(() => {
          someAtom.value = 2;
          someAtom.value = 3;
          expect(spy).toHaveBeenCalledTimes(1); // Still 1
        });
        expect(spy).toHaveBeenCalledTimes(2); // Final value synced
        expect(spy).toHaveBeenCalledWith(3, 1);
      });

      it('should maintain order during re-entrancy (Breadth-First)', () => {
        const someAtom = atom(1, { sync: true });
        const notificationLog: string[] = [];

        someAtom.subscribe((newValue, oldValue) => {
          notificationLog.push(`sub1: ${oldValue} -> ${newValue}`);
          if (newValue === 2) someAtom.value = 3; // Re-entry
        });
        someAtom.subscribe((newValue, oldValue) =>
          notificationLog.push(`sub2: ${oldValue} -> ${newValue}`)
        );

        someAtom.value = 2; // Trigger

        expect(notificationLog).toEqual([
          'sub1: 1 -> 2',
          'sub2: 1 -> 2',
          'sub1: 2 -> 3',
          'sub2: 2 -> 3',
        ]);
      });

      it('should handle unsubscription safely during the notification loop (Re-entry)', () => {
        const someAtom = atom(0, { sync: true });
        let unsubscribeCallback: (() => void) | undefined;
        const notificationLog: number[] = [];

        unsubscribeCallback = someAtom.subscribe((newValue) => {
          notificationLog.push(newValue ?? 0);
          if (newValue === 1) unsubscribeCallback?.();
        });
        someAtom.subscribe((newValue) => notificationLog.push(newValue ?? 0));

        expect(someAtom.subscriberCount()).toBe(2);
        someAtom.value = 1;

        expect(notificationLog).toEqual([1, 1]);
        expect(someAtom.subscriberCount()).toBe(1);
      });

      it('should not leave redundant jobs in the scheduler after synchronous re-entrant updates', () => {
        const someAtom = atom(1, { sync: true });
        someAtom.subscribe((newValue) => {
          if (newValue === 2) {
            someAtom.value = 3;
          }
        });

        someAtom.value = 2;
        expect(globalScheduler.queueSize).toBe(0);
      });

      it('should not notify a newly added subscriber due to slot reuse during the same notification cycle', () => {
        const someAtom = atom(0, { sync: true });
        const notificationLog: string[] = [];

        someAtom.subscribe(() => {
          notificationLog.push('s1');
          unsub2();
          someAtom.subscribe(() => {
            notificationLog.push('s3');
          });
        });

        const unsub2 = someAtom.subscribe(() => {
          notificationLog.push('s2');
        });

        someAtom.value = 1;

        expect(notificationLog).toEqual(['s1']);
      });
    });

    it('should correctly expose internal getters: isNotifying, isNotificationScheduled, and isSync', async () => {
      const someAtom = atom(42);
      expect(Reflect.get(someAtom, 'isNotifying')).toBe(false);
      expect(Reflect.get(someAtom, 'isNotificationScheduled')).toBe(false);
      expect(Reflect.get(someAtom, 'isSync')).toBe(false);

      let notified = false;
      someAtom.subscribe(() => {
        notified = true;
        expect(Reflect.get(someAtom, 'isNotifying')).toBe(true);
      });

      someAtom.value = 100;
      expect(Reflect.get(someAtom, 'isNotificationScheduled')).toBe(true);

      await aeNextTick();
      expect(notified).toBe(true);
      expect(Reflect.get(someAtom, 'isNotifying')).toBe(false);
      expect(Reflect.get(someAtom, 'isNotificationScheduled')).toBe(false);

      const syncAtom = atom(42, { sync: true });
      expect(Reflect.get(syncAtom, 'isSync')).toBe(true);
    });
  });

  describe('peek()', () => {
    it('returns current value synchronously without side-effects', () => {
      const someAtom = atom(7);
      expect(someAtom.peek()).toBe(7);
      someAtom.value = 8;
      expect(someAtom.peek()).toBe(8);
    });

    it('should return undefined on peek after disposal', () => {
      const someAtom = atom(42);
      someAtom.dispose();
      expect(someAtom.peek()).toBeUndefined();
    });
  });

  describe('subscribe()', () => {
    it('rejects invalid subscribers', () => {
      const someAtom = atom(42);
      // @ts-expect-error
      expect(() => someAtom.subscribe('invalid')).toThrow(AtomError);
      // @ts-expect-error
      expect(() => someAtom.subscribe(null)).toThrow(AtomError);
      // @ts-expect-error
      expect(() => someAtom.subscribe({})).toThrow(AtomError);

      // Valid subscriber with execute method should not throw
      expect(() => someAtom.subscribe({ execute: vi.fn() })).not.toThrow();
    });

    it('manages counts, duplicate warnings, and unsubscription idempotently', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const someAtom = atom(0);
      const spyCallback = vi.fn();

      const unsub1 = someAtom.subscribe(spyCallback);
      expect(someAtom.subscriberCount()).toBe(1);

      const unsub2 = someAtom.subscribe(spyCallback);
      expect(consoleWarn).toHaveBeenCalled();
      expect(someAtom.subscriberCount()).toBe(1);

      unsub1();
      expect(someAtom.subscriberCount()).toBe(0);
      expect(() => unsub2()).not.toThrow(); // Safe double unsubscribe
    });

    it('should isolate subscriber errors to prevent chain collapse', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const someAtom = atom(0);
      const good = vi.fn();

      someAtom.subscribe(() => {
        throw new Error('boom');
      });
      someAtom.subscribe(good);

      someAtom.value = 1;
      await aeNextTick();

      expect(good).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
    });

    it('Duplicate subscription checks across all slots and overflow', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const someAtom = atom(0);
      const callback0 = () => {};
      const callback1 = () => {};
      const callback2 = () => {};
      const callback3 = () => {};
      const callback4 = () => {};
      const callback5 = () => {};

      someAtom.subscribe(callback0);
      someAtom.subscribe(callback1);
      someAtom.subscribe(callback2);
      someAtom.subscribe(callback3);
      someAtom.subscribe(callback4);
      someAtom.subscribe(callback5);

      someAtom.subscribe(callback0);
      expect(consoleWarn).toHaveBeenCalledTimes(1);
      someAtom.subscribe(callback1);
      expect(consoleWarn).toHaveBeenCalledTimes(2);
      someAtom.subscribe(callback2);
      expect(consoleWarn).toHaveBeenCalledTimes(3);
      someAtom.subscribe(callback3);
      expect(consoleWarn).toHaveBeenCalledTimes(4);
      someAtom.subscribe(callback4);
      expect(consoleWarn).toHaveBeenCalledTimes(5);
      someAtom.subscribe(callback5);
      expect(consoleWarn).toHaveBeenCalledTimes(6);
    });

    it('Subscriber error logging across all slots and overflow', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const someAtom = atom(0);
      const throwingCallback = (msg: string) => () => {
        throw new Error(msg);
      };

      for (let i = 0; i < 6; i++) {
        someAtom.subscribe(throwingCallback(`bad${i}`));
      }

      someAtom.value = 1;
      await aeNextTick();

      expect(consoleError).toHaveBeenCalledTimes(6);
    });
  });

  describe('dispose()', () => {
    it('rigidly clears listeners', async () => {
      const someAtom = atom(0);
      const spy = vi.fn();

      someAtom.subscribe(spy);
      someAtom.dispose();

      expect(someAtom.subscriberCount()).toBe(0);

      someAtom.value = 99;
      await aeNextTick();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not allow value update or retention after disposal', () => {
      const someAtom = atom<{ data: string } | null>({ data: 'initial' });
      someAtom.dispose();
      someAtom.value = { data: 'leak' };
      expect(someAtom.peek()).toBeUndefined();
    });

    it('should not allow or retain subscriptions after disposal', () => {
      const someAtom = atom(0);
      someAtom.dispose();
      const unsubscribeCallback = someAtom.subscribe(() => {});
      expect(someAtom.subscriberCount()).toBe(0);
      expect(() => unsubscribeCallback()).not.toThrow();
      expect(Reflect.get(someAtom, '_subscriberSlots')).toBeNull();
    });

    it('should return undefined on read access after disposal', () => {
      const someAtom = atom(42);
      someAtom.dispose();
      expect(someAtom.value).toBeUndefined();
    });

    it('should not retain disposed atoms in computed/effect dependency buffers', () => {
      const someAtom = atom(42);
      someAtom.dispose();

      const computedInstance = computed(() => {
        return someAtom.value;
      });

      computedInstance.value;

      const slots = Reflect.get(computedInstance, '_depSlots');
      if (slots) {
        for (let i = 0; i < slots.length; i++) {
          const link = slots.at(i);
          if (link && link.node === someAtom) {
            throw new Error('Disposed atom retained in dependencies');
          }
        }
      }
    });

    it('should break out of flushNotifications and clear the scheduled flag when prev is NO_VALUE', () => {
      const someAtom = atom(42);

      const currentFlags = Reflect.get(someAtom, 'flags') as number;
      Reflect.set(someAtom, 'flags', currentFlags | ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED);

      expect(() => {
        Reflect.get(someAtom, 'execute').call(someAtom);
      }).not.toThrow();

      expect(
        (Reflect.get(someAtom, 'flags') as number) & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED
      ).toBe(0);
    });
  });
});
