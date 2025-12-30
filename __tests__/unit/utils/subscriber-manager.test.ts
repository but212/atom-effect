/**
 * @fileoverview SubscriberManager 테스트
 */

import { describe, expect, it, vi } from 'vitest';
import { SubscriberManager } from '@/utils/subscriber-manager';

describe('SubscriberManager', () => {
  describe('add', () => {
    it('구독자를 추가할 수 있다', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      manager.add(subscriber);

      expect(manager.size).toBe(1);
      expect(manager.has(subscriber)).toBe(true);
    });

    it('중복 구독자는 무시한다', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      manager.add(subscriber);
      manager.add(subscriber);

      expect(manager.size).toBe(1);
    });

    it('unsubscribe 함수를 반환한다', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      const unsub = manager.add(subscriber);
      expect(manager.size).toBe(1);

      unsub();
      expect(manager.size).toBe(0);
      expect(manager.has(subscriber)).toBe(false);
    });

    it('여러 구독자를 추가할 수 있다', () => {
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
    it('구독자를 제거할 수 있다', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      manager.add(subscriber);
      const removed = manager.remove(subscriber);

      expect(removed).toBe(true);
      expect(manager.size).toBe(0);
      expect(manager.has(subscriber)).toBe(false);
    });

    it('존재하지 않는 구독자 제거 시 false 반환', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      const removed = manager.remove(subscriber);

      expect(removed).toBe(false);
    });

    it('중간 구독자를 제거해도 순서가 유지된다 (swap-and-pop)', () => {
      const manager = new SubscriberManager<() => void>();
      const sub1 = vi.fn();
      const sub2 = vi.fn();
      const sub3 = vi.fn();

      manager.add(sub1);
      manager.add(sub2);
      manager.add(sub3);

      // 중간 제거
      manager.remove(sub2);

      expect(manager.size).toBe(2);
      expect(manager.has(sub1)).toBe(true);
      expect(manager.has(sub2)).toBe(false);
      expect(manager.has(sub3)).toBe(true);

      // 남은 구독자 확인
      const subscribers = manager.toArray();
      expect(subscribers).toContain(sub1);
      expect(subscribers).toContain(sub3);
    });

    it('마지막 구독자를 제거할 수 있다', () => {
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
    it('구독자 존재 여부를 확인할 수 있다', () => {
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
    it('모든 구독자를 순회한다', () => {
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

    it('빈 매니저에서 forEach는 아무것도 실행하지 않는다', () => {
      const manager = new SubscriberManager<() => void>();
      const callback = vi.fn();

      manager.forEach(callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('forEach 중 에러가 발생하면 전파된다', () => {
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
    it('에러를 잡아서 처리한다', () => {
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

    it('onError가 없으면 console.error로 로그한다', () => {
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
    it('size가 정확하다', () => {
      const manager = new SubscriberManager<() => void>();

      expect(manager.size).toBe(0);

      manager.add(vi.fn());
      expect(manager.size).toBe(1);

      manager.add(vi.fn());
      expect(manager.size).toBe(2);

      manager.clear();
      expect(manager.size).toBe(0);
    });

    it('hasSubscribers가 정확하다', () => {
      const manager = new SubscriberManager<() => void>();

      expect(manager.hasSubscribers).toBe(false);

      manager.add(vi.fn());
      expect(manager.hasSubscribers).toBe(true);

      manager.clear();
      expect(manager.hasSubscribers).toBe(false);
    });
  });

  describe('clear', () => {
    it('모든 구독자를 제거한다', () => {
      const manager = new SubscriberManager<() => void>();

      manager.add(vi.fn());
      manager.add(vi.fn());
      manager.add(vi.fn());

      expect(manager.size).toBe(3);

      manager.clear();

      expect(manager.size).toBe(0);
      expect(manager.hasSubscribers).toBe(false);
    });

    it('clear 후 다시 추가할 수 있다 (lazy re-initialization)', () => {
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
    it('모든 구독자를 배열로 반환한다', () => {
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

    it('빈 매니저는 빈 배열을 반환한다', () => {
      const manager = new SubscriberManager<() => void>();

      const arr = manager.toArray();

      expect(arr).toEqual([]);
    });

    it('반환된 배열은 복사본이다', () => {
      const manager = new SubscriberManager<() => void>();
      const sub = vi.fn();

      manager.add(sub);

      const arr = manager.toArray();
      arr.push(vi.fn()); // 배열 수정

      expect(manager.size).toBe(1); // 원본은 영향받지 않음
    });
  });

  describe('unsubscribe 중복 호출 방지', () => {
    it('unsubscribe를 여러 번 호출해도 안전하다', () => {
      const manager = new SubscriberManager<() => void>();
      const subscriber = vi.fn();

      const unsub = manager.add(subscriber);

      unsub();
      expect(manager.size).toBe(0);

      unsub(); // 두 번째 호출
      expect(manager.size).toBe(0); // 여전히 0
    });
  });

  describe('타입 안전성', () => {
    it('다양한 함수 시그니처를 지원한다', () => {
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
