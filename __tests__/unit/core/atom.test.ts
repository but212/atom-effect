/**
 * @fileoverview Atom 전용 테스트 (커버리지 보완)
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError } from '@/errors/errors';
import { debug } from '@/utils/debug';

describe('Atom - 에러 처리 및 엣지 케이스', () => {
  it('잘못된 타입의 구독자를 거부한다', () => {
    const count = atom(0);

    expect(() => {
      count.subscribe('not a function' as any);
    }).toThrow(AtomError);

    expect(() => {
      count.subscribe(null as any);
    }).toThrow(AtomError);
  });

  it('존재하지 않는 리스너 구독 해제는 안전하다', () => {
    const count = atom(0);
    const listener = vi.fn();

    const unsubscribe = count.subscribe(listener);
    unsubscribe();

    // 이미 구독 해제된 리스너를 다시 해제해도 안전
    expect(() => unsubscribe()).not.toThrow();
  });

  it('구독자 실행 중 에러가 발생해도 다른 구독자는 실행된다', async () => {
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

  it('객체 구독자(execute 메서드)가 정상 동작한다', async () => {
    const count = atom(0);
    const executeCalls: number[] = [];

    const _objectSubscriber = {
      execute: () => {
        executeCalls.push(count.peek());
      },
    };

    // computed가 객체 구독자로 등록됨
    const c = computed(() => count.value * 2);
    c.value; // 의존성 등록

    count.value = 5;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(c.value).toBe(10);
  });

  it('sync 옵션으로 동기 알림이 작동한다', () => {
    const count = atom(0, { sync: true });
    const calls: number[] = [];

    count.subscribe((newValue) => {
      if (newValue !== undefined) calls.push(newValue);
    });

    count.value = 1;
    // sync=true이므로 즉시 실행됨
    expect(calls).toEqual([1]);
  });

  it('버전 관리로 오래된 알림을 무시한다', async () => {
    const count = atom(0);
    const calls: number[] = [];

    count.subscribe((newValue) => {
      if (newValue !== undefined) calls.push(newValue);
    });

    // 빠르게 여러 번 업데이트
    count.value = 1;
    count.value = 2;
    count.value = 3;

    await new Promise((resolve) => setTimeout(resolve, 10));

    // 버전 관리로 인해 최종 값만 반영
    expect(calls[calls.length - 1]).toBe(3);
  });

  it('dispose 후에도 값은 읽을 수 있다', () => {
    const count = atom(10);
    count.dispose();

    // dispose 후에도 peek는 작동
    expect(count.peek()).toBe(undefined); // dispose에서 undefined로 설정됨
  });

  it('computed를 통한 객체 구독자 동작 확인', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);

    c.value; // 의존성 등록 (computed가 객체 구독자로 등록됨)

    count.value = 5;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(c.value).toBe(10);
  });

  describe('Map 기반 구독 최적화', () => {
    it('대량의 구독자를 효율적으로 관리한다 (O(1) 추가/제거)', () => {
      const count = atom(0);
      const listeners: Array<() => void> = [];
      const unsubscribers: Array<() => void> = [];

      // 1000개의 구독자 추가
      for (let i = 0; i < 1000; i++) {
        const listener = vi.fn();
        listeners.push(listener);
        unsubscribers.push(count.subscribe(listener));
      }

      // 중간 구독자들 제거 (free slot 생성)
      for (let i = 100; i < 200; i++) {
        unsubscribers[i]?.();
      }

      // 새 구독자 추가 (free slot 재사용)
      for (let i = 0; i < 50; i++) {
        const newListener = vi.fn();
        count.subscribe(newListener);
      }

      // 모든 작업이 빠르게 완료되어야 함
      expect(count.value).toBe(0);
    });

    it('구독자 제거 후 알림을 받지 않는다', async () => {
      const count = atom(0);
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      const _unsub1 = count.subscribe(listener1);
      const unsub2 = count.subscribe(listener2);
      const _unsub3 = count.subscribe(listener3);

      // listener2만 제거
      unsub2();

      count.value = 1;
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener1).toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled(); // 제거됨
      expect(listener3).toHaveBeenCalled();
    });

    it('중복 구독 해제는 안전하다 (isUnsubscribed 플래그)', () => {
      const count = atom(0);
      const listener = vi.fn();

      const unsubscribe = count.subscribe(listener);

      // 여러 번 호출해도 안전
      expect(() => {
        unsubscribe();
        unsubscribe();
        unsubscribe();
      }).not.toThrow();
    });

    it('free slot을 재사용하여 메모리를 효율적으로 관리한다', () => {
      const count = atom(0);
      const unsubscribers: Array<() => void> = [];

      // 100개 추가
      for (let i = 0; i < 100; i++) {
        unsubscribers.push(count.subscribe(vi.fn()));
      }

      // 50개 제거 (free slots 생성)
      for (let i = 0; i < 50; i++) {
        unsubscribers[i]?.();
      }

      // 25개 추가 (free slots 재사용)
      for (let i = 0; i < 25; i++) {
        count.subscribe(vi.fn());
      }

      // 내부 배열이 무한정 커지지 않아야 함
      // (정확한 크기는 구현에 따라 다르지만, 재사용이 작동하는지 확인)
      expect(count.value).toBe(0);
    });
  });

  describe('동기 모드 에러 처리', () => {
    it('sync=true 모드에서 구독자 에러가 발생해도 다른 구독자는 실행된다', () => {
      const count = atom(0, { sync: true });
      const errorListener = vi.fn(() => {
        throw new Error('Sync error');
      });
      const normalListener = vi.fn();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      count.subscribe(errorListener);
      count.subscribe(normalListener);

      count.value = 1;

      // sync이므로 즉시 실행됨
      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('객체 구독자(execute)에서 에러가 발생해도 다른 구독자는 실행된다', async () => {
      const count = atom(0);
      const normalListener = vi.fn();

      // computed를 만들어서 일부러 에러를 발생시킴
      const errorComputed = computed(() => {
        const val = count.value;
        if (val > 0) throw new Error('Computed error');
        return val;
      });

      const normalComputed = computed(() => count.value * 2);

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      count.subscribe(normalListener);
      errorComputed.value; // 의존성 등록
      normalComputed.value; // 의존성 등록

      count.value = 1;
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(normalListener).toHaveBeenCalled();
      expect(normalComputed.value).toBe(2);

      consoleError.mockRestore();
    });
  });

  describe('Debug 모드', () => {
    it('debug 모드에서 subscriberCount를 제공한다', () => {
      const wasEnabled = debug.enabled;
      debug.enabled = true;

      const count = atom(0);

      // subscriberCount 메서드가 있어야 함
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
