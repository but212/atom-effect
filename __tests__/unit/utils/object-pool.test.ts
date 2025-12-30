/**
 * @fileoverview Object Pool 테스트 (커버리지 보완)
 */

import { describe, expect, it } from 'vitest';
import {
  Notification,
  notificationPool,
  ObjectPool,
  SchedulerCallback,
  schedulerCallbackPool,
} from '@/utils/object-pool';

describe('ObjectPool', () => {
  it('새 객체를 생성한다', () => {
    const pool = new ObjectPool(() => ({ reset: () => {} }));
    const obj = pool.acquire();

    expect(obj).toBeDefined();
    expect(typeof obj.reset).toBe('function');
  });

  it('객체를 재사용한다', () => {
    const pool = new ObjectPool(() => ({ reset: () => {} }));

    const obj1 = pool.acquire();
    pool.release(obj1);

    const obj2 = pool.acquire();

    // 동일한 객체 재사용
    expect(obj2).toBe(obj1);
  });

  it('release 시 reset을 호출한다', () => {
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

  it('maxPoolSize를 초과하면 객체를 버린다', () => {
    const pool = new ObjectPool(() => ({ reset: () => {} }), 2);

    const obj1 = pool.acquire();
    const obj2 = pool.acquire();
    const obj3 = pool.acquire();

    pool.release(obj1);
    pool.release(obj2);
    pool.release(obj3); // 3개째는 버려짐 (maxPoolSize=2)

    const reacquired1 = pool.acquire();
    const reacquired2 = pool.acquire();
    const reacquired3 = pool.acquire();

    // obj1, obj2는 재사용 (LIFO: 나중에 넣은 것부터), obj3는 버려져서 새로 생성
    expect(reacquired1).toBe(obj2); // LIFO 순서
    expect(reacquired2).toBe(obj1);
    expect(reacquired3).not.toBe(obj3);
  });

  it('clear가 풀을 초기화한다', () => {
    const pool = new ObjectPool(() => ({ reset: () => {} }));

    const obj = pool.acquire();
    pool.release(obj);

    pool.clear();

    const newObj = pool.acquire();
    expect(newObj).not.toBe(obj); // clear 후 새 객체
  });
});

describe('Notification', () => {
  it('생성자로 초기화할 수 있다', () => {
    const listener = () => {};
    const notification = new Notification(listener, 10, 5);

    expect(notification.listener).toBe(listener);
    expect(notification.newValue).toBe(10);
    expect(notification.oldValue).toBe(5);
  });

  it('생성자 인자 없이 생성할 수 있다', () => {
    const notification = new Notification();

    expect(notification.listener).toBe(null);
    expect(notification.newValue).toBeUndefined();
    expect(notification.oldValue).toBeUndefined();
  });

  it('execute가 listener를 호출한다', () => {
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

  it('listener가 null이면 execute는 아무 것도 하지 않는다', () => {
    const notification = new Notification();

    // 에러 없이 실행되어야 함
    expect(() => notification.execute()).not.toThrow();
  });

  it('reset이 모든 속성을 초기화한다', () => {
    const notification = new Notification(() => {}, 10, 5);
    notification.reset();

    expect(notification.listener).toBe(null);
    expect(notification.newValue).toBeUndefined();
    expect(notification.oldValue).toBeUndefined();
  });
});

describe('SchedulerCallback', () => {
  it('생성자로 초기화할 수 있다', () => {
    const callback = () => {};
    const schedulerCallback = new SchedulerCallback(callback);

    expect(schedulerCallback.callback).toBe(callback);
  });

  it('생성자 인자 없이 생성할 수 있다', () => {
    const schedulerCallback = new SchedulerCallback();

    expect(schedulerCallback.callback).toBe(null);
  });

  it('execute가 callback을 호출한다', () => {
    let called = false;
    const callback = () => {
      called = true;
    };

    const schedulerCallback = new SchedulerCallback(callback);
    schedulerCallback.execute();

    expect(called).toBe(true);
  });

  it('callback이 null이면 execute는 아무 것도 하지 않는다', () => {
    const schedulerCallback = new SchedulerCallback();

    // 에러 없이 실행되어야 함
    expect(() => schedulerCallback.execute()).not.toThrow();
  });

  it('reset이 callback을 초기화한다', () => {
    const schedulerCallback = new SchedulerCallback(() => {});
    schedulerCallback.reset();

    expect(schedulerCallback.callback).toBe(null);
  });
});

describe('전역 객체 풀', () => {
  it('notificationPool이 존재한다', () => {
    expect(notificationPool).toBeDefined();
    expect(notificationPool).toBeInstanceOf(ObjectPool);
  });

  it('schedulerCallbackPool이 존재한다', () => {
    expect(schedulerCallbackPool).toBeDefined();
    expect(schedulerCallbackPool).toBeInstanceOf(ObjectPool);
  });

  it('notificationPool이 Notification을 생성한다', () => {
    const notification = notificationPool.acquire();

    expect(notification).toBeInstanceOf(Notification);

    notificationPool.release(notification);
  });

  it('schedulerCallbackPool이 SchedulerCallback을 생성한다', () => {
    const callback = schedulerCallbackPool.acquire();

    expect(callback).toBeInstanceOf(SchedulerCallback);

    schedulerCallbackPool.release(callback);
  });
});
