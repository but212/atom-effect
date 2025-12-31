/**
 * @fileoverview SubscriberManager tests
 */

import { describe, expect, it, vi } from 'vitest';
import { SubscriberManager } from '@/utils/subscriber-manager';

describe('SubscriberManager', () => {
  describe('add', () => {
    it('can add a subscriber', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      manager.add(subscriber);

      expect(manager.size).toBe(1);
      expect(manager.has(subscriber)).toBe(true);
    });

    it('ignores duplicate subscribers', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      manager.add(subscriber);
      manager.add(subscriber);

      expect(manager.size).toBe(1);
    });

    it('returns an unsubscribe function', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      const unsub = manager.add(subscriber);
      expect(manager.size).toBe(1);

      unsub();
      expect(manager.size).toBe(0);
      expect(manager.has(subscriber)).toBe(false);
    });

    it('can add multiple subscribers', () => {
      const manager = new SubscriberManager<() => void>();
      const sub1 = vi.fn();
      const sub2 = vi.fn();
      const sub3 = vi.fn();

      manager.add(sub1);
      manager.add(sub2);
      manager.add(sub3);

      expect(manager.size).toBe(3);
    });
  });

  describe('remove', () => {
    it('can remove a subscriber', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      manager.add(subscriber);
      const removed = manager.remove(subscriber);

      expect(removed).toBe(true);
      expect(manager.size).toBe(0);
      expect(manager.has(subscriber)).toBe(false);
    });

    it('returns false when removing non-existent subscriber', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      const removed = manager.remove(subscriber);

      expect(removed).toBe(false);
    });

    it('maintains order when removing middle subscriber (swap-and-pop)', () => {
      const manager = new SubscriberManager<() => void>();
      const sub1 = vi.fn();
      const sub2 = vi.fn();
      const sub3 = vi.fn();

      manager.add(sub1);
      manager.add(sub2);
      manager.add(sub3);

      // Remove middle subscriber
      manager.remove(sub2);

      expect(manager.size).toBe(2);
      expect(manager.has(sub1)).toBe(true);
      expect(manager.has(sub2)).toBe(false);
      expect(manager.has(sub3)).toBe(true);

      // Verify remaining subscribers
      const subscribers = manager.toArray();
      expect(subscribers).toContain(sub1);
      expect(subscribers).toContain(sub3);
    });

    it('can remove the last subscriber', () => {
      const manager = new SubscriberManager<() => void>();
      const sub1 = vi.fn();
      const sub2 = vi.fn();

      manager.add(sub1);
      manager.add(sub2);

      manager.remove(sub2);

      expect(manager.size).toBe(1);
      expect(manager.has(sub1)).toBe(true);
      expect(manager.has(sub2)).toBe(false);
    });
  });

  describe('has', () => {
    it('can check if a subscriber exists', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      expect(manager.has(subscriber)).toBe(false);

      manager.add(subscriber);
      expect(manager.has(subscriber)).toBe(true);

      manager.remove(subscriber);
      expect(manager.has(subscriber)).toBe(false);
    });
  });

  describe('forEach', () => {
    it('iterates over all subscribers', () => {
      const manager = new SubscriberManager<(value: number) => void>();
      const sub1 = vi.fn();
      const sub2 = vi.fn();
      const sub3 = vi.fn();

      manager.add(sub1);
      manager.add(sub2);
      manager.add(sub3);

      manager.forEach((subscriber) => {
        subscriber(42);
      });

      expect(sub1).toHaveBeenCalledWith(42);
      expect(sub2).toHaveBeenCalledWith(42);
      expect(sub3).toHaveBeenCalledWith(42);
    });

    it('forEach does nothing on empty manager', () => {
      const manager = new SubscriberManager<() => void>();
      const callback = vi.fn();

      manager.forEach(callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('propagates errors thrown during forEach', () => {
      const manager = new SubscriberManager<() => void>();
      const sub = vi.fn(() => {
        throw new Error('Test error');
      });

      manager.add(sub);

      expect(() => {
        manager.forEach((subscriber) => subscriber());
      }).toThrow('Test error');
    });
  });

  describe('forEachSafe', () => {
    it('catches and handles errors', () => {
      const manager = new SubscriberManager<() => void>();
      const sub1 = vi.fn();
      const sub2 = vi.fn(() => {
        throw new Error('Test error');
      });
      const sub3 = vi.fn();

      manager.add(sub1);
      manager.add(sub2);
      manager.add(sub3);

      const onError = vi.fn();

      manager.forEachSafe((subscriber) => subscriber(), onError);

      expect(sub1).toHaveBeenCalled();
      expect(sub2).toHaveBeenCalled();
      expect(sub3).toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('logs to console.error when onError is not provided', () => {
      const manager = new SubscriberManager<() => void>();
      const sub = vi.fn(() => {
        throw new Error('Test error');
      });

      manager.add(sub);

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      manager.forEachSafe((subscriber) => subscriber());

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('size & hasSubscribers', () => {
    it('size is accurate', () => {
      const manager = new SubscriberManager<() => void>();

      expect(manager.size).toBe(0);

      manager.add(vi.fn());
      expect(manager.size).toBe(1);

      manager.add(vi.fn());
      expect(manager.size).toBe(2);

      manager.clear();
      expect(manager.size).toBe(0);
    });

    it('hasSubscribers is accurate', () => {
      const manager = new SubscriberManager<() => void>();

      expect(manager.hasSubscribers).toBe(false);

      manager.add(vi.fn());
      expect(manager.hasSubscribers).toBe(true);

      manager.clear();
      expect(manager.hasSubscribers).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all subscribers', () => {
      const manager = new SubscriberManager<() => void>();

      manager.add(vi.fn());
      manager.add(vi.fn());
      manager.add(vi.fn());

      expect(manager.size).toBe(3);

      manager.clear();

      expect(manager.size).toBe(0);
      expect(manager.hasSubscribers).toBe(false);
    });

    it('can add subscribers again after clear (lazy re-initialization)', () => {
      const manager = new SubscriberManager<() => void>();
      const sub = vi.fn();

      manager.add(sub);
      manager.clear();
      manager.add(sub);

      expect(manager.size).toBe(1);
      expect(manager.has(sub)).toBe(true);
    });
  });

  describe('toArray', () => {
    it('returns all subscribers as an array', () => {
      const manager = new SubscriberManager<() => void>();
      const sub1 = vi.fn();
      const sub2 = vi.fn();

      manager.add(sub1);
      manager.add(sub2);

      const arr = manager.toArray();

      expect(arr).toHaveLength(2);
      expect(arr).toContain(sub1);
      expect(arr).toContain(sub2);
    });

    it('returns an empty array for empty manager', () => {
      const manager = new SubscriberManager<() => void>();

      const arr = manager.toArray();

      expect(arr).toEqual([]);
    });

    it('returned array is a copy', () => {
      const manager = new SubscriberManager<() => void>();
      const sub = vi.fn();

      manager.add(sub);

      const arr = manager.toArray();
      arr.push(vi.fn()); // Modify array

      expect(manager.size).toBe(1); // Original is not affected
    });
  });

  describe('prevent duplicate unsubscribe calls', () => {
    it('is safe to call unsubscribe multiple times', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      const unsub = manager.add(subscriber);

      unsub();
      expect(manager.size).toBe(0);

      unsub(); // Second call
      expect(manager.size).toBe(0); // Still 0
    });
  });

  describe('type safety', () => {
    it('supports various function signatures', () => {
      type Listener1 = () => void;
      type Listener2 = (value: number) => void;
      type Listener3 = (value: number, oldValue: number) => void;

      const manager1 = new SubscriberManager<Listener1>();
      const manager2 = new SubscriberManager<Listener2>();
      const manager3 = new SubscriberManager<Listener3>();

      const sub1: Listener1 = vi.fn();
      const sub2: Listener2 = vi.fn();
      const sub3: Listener3 = vi.fn();

      manager1.add(sub1);
      manager2.add(sub2);
      manager3.add(sub3);

      manager1.forEach((s) => s());
      manager2.forEach((s) => s(10));
      manager3.forEach((s) => s(10, 5));

      expect(sub1).toHaveBeenCalled();
      expect(sub2).toHaveBeenCalledWith(10);
      expect(sub3).toHaveBeenCalledWith(10, 5);
    });
  });
});
