/**
 * @fileoverview Object Pool tests (coverage supplement)
 */

import {
  Notification,
  notificationPool,
  ObjectPool,
  SchedulerCallback,
  schedulerCallbackPool,
} from '@/utils/object-pool';
import { describe, expect, it } from 'vitest';

describe('ObjectPool', () => {
  it('creates a new object', () => {
    const pool = new ObjectPool(() => ({ reset: () => {} }));
    const obj = pool.acquire();

    expect(obj).toBeDefined();
    expect(typeof obj.reset).toBe('function');
  });

  it('reuses objects', () => {
    const pool = new ObjectPool(() => ({ reset: () => {} }));

    const obj1 = pool.acquire();
    pool.release(obj1);

    const obj2 = pool.acquire();

    // Same object reused
    expect(obj2).toBe(obj1);
  });

  it('calls reset on release', () => {
    let resetCalled = false;
    const pool = new ObjectPool(() => ({
      reset: () => {
        resetCalled = true;
      },
    }));

    const obj = pool.acquire();
    pool.release(obj);

    expect(resetCalled).toBe(true);
  });

  it('discards objects when maxPoolSize is exceeded', () => {
    const pool = new ObjectPool(() => ({ reset: () => {} }), 2);

    const obj1 = pool.acquire();
    const obj2 = pool.acquire();
    const obj3 = pool.acquire();

    pool.release(obj1);
    pool.release(obj2);
    pool.release(obj3); // Third one is discarded (maxPoolSize=2)

    const reacquired1 = pool.acquire();
    const reacquired2 = pool.acquire();
    const reacquired3 = pool.acquire();

    // obj1, obj2 are reused (LIFO: last in first out), obj3 is discarded so new one is created
    expect(reacquired1).toBe(obj2); // LIFO order
    expect(reacquired2).toBe(obj1);
    expect(reacquired3).not.toBe(obj3);
  });

  it('clear resets the pool', () => {
    const pool = new ObjectPool(() => ({ reset: () => {} }));

    const obj = pool.acquire();
    pool.release(obj);

    pool.clear();

    const newObj = pool.acquire();
    expect(newObj).not.toBe(obj); // New object after clear
  });
});

describe('Notification', () => {
  it('can be initialized with constructor', () => {
    const listener = () => {};
    const notification = new Notification(listener, 10, 5);

    expect(notification.listener).toBe(listener);
    expect(notification.newValue).toBe(10);
    expect(notification.oldValue).toBe(5);
  });

  it('can be created without constructor arguments', () => {
    const notification = new Notification();

    expect(notification.listener).toBe(null);
    expect(notification.newValue).toBeUndefined();
    expect(notification.oldValue).toBeUndefined();
  });

  it('execute calls the listener', () => {
    let called = false;
    let receivedNew: any;
    let receivedOld: any;

    const listener = (newVal: any, oldVal: any) => {
      called = true;
      receivedNew = newVal;
      receivedOld = oldVal;
    };

    const notification = new Notification(listener, 20, 10);
    notification.execute();

    expect(called).toBe(true);
    expect(receivedNew).toBe(20);
    expect(receivedOld).toBe(10);
  });

  it('execute does nothing when listener is null', () => {
    const notification = new Notification();

    // Should execute without error
    expect(() => notification.execute()).not.toThrow();
  });

  it('reset initializes all properties', () => {
    const notification = new Notification(() => {}, 10, 5);
    notification.reset();

    expect(notification.listener).toBe(null);
    expect(notification.newValue).toBeUndefined();
    expect(notification.oldValue).toBeUndefined();
  });
});

describe('SchedulerCallback', () => {
  it('can be initialized with constructor', () => {
    const callback = () => {};
    const schedulerCallback = new SchedulerCallback(callback);

    expect(schedulerCallback.callback).toBe(callback);
  });

  it('can be created without constructor arguments', () => {
    const schedulerCallback = new SchedulerCallback();

    expect(schedulerCallback.callback).toBe(null);
  });

  it('execute calls the callback', () => {
    let called = false;
    const callback = () => {
      called = true;
    };

    const schedulerCallback = new SchedulerCallback(callback);
    schedulerCallback.execute();

    expect(called).toBe(true);
  });

  it('execute does nothing when callback is null', () => {
    const schedulerCallback = new SchedulerCallback();

    // Should execute without error
    expect(() => schedulerCallback.execute()).not.toThrow();
  });

  it('reset initializes the callback', () => {
    const schedulerCallback = new SchedulerCallback(() => {});
    schedulerCallback.reset();

    expect(schedulerCallback.callback).toBe(null);
  });
});

describe('Global object pools', () => {
  it('notificationPool exists', () => {
    expect(notificationPool).toBeDefined();
    expect(notificationPool).toBeInstanceOf(ObjectPool);
  });

  it('schedulerCallbackPool exists', () => {
    expect(schedulerCallbackPool).toBeDefined();
    expect(schedulerCallbackPool).toBeInstanceOf(ObjectPool);
  });

  it('notificationPool creates Notification', () => {
    const notification = notificationPool.acquire();

    expect(notification).toBeInstanceOf(Notification);

    notificationPool.release(notification);
  });

  it('schedulerCallbackPool creates SchedulerCallback', () => {
    const callback = schedulerCallbackPool.acquire();

    expect(callback).toBeInstanceOf(SchedulerCallback);

    schedulerCallbackPool.release(callback);
  });
});
