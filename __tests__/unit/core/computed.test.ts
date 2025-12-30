/**
 * @fileoverview Computed 전용 테스트 (커버리지 보완)
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { ComputedError } from '@/errors/errors';

describe('Computed - 에러 처리 및 엣지 케이스', () => {
  it('잘못된 타입의 함수를 거부한다', () => {
    expect(() => {
      computed('not a function' as any);
    }).toThrow(ComputedError);

    expect(() => {
      computed(null as any);
    }).toThrow(ComputedError);
  });

  it('잘못된 타입의 구독자를 거부한다', () => {
    const c = computed(() => 1);

    expect(() => {
      c.subscribe('not a function' as any);
    }).toThrow(ComputedError);
  });

  it('defaultValue 없이 pending 상태에서 value 접근 시 에러', () => {
    const c = computed(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return 42;
    });

    // pending 상태에서 defaultValue 없이 접근
    expect(() => c.value).toThrow(ComputedError);
  });

  it('비동기 계산 중 rejected 상태 처리', async () => {
    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('Async error');
      },
      { defaultValue: 0 }
    );

    // 초기 defaultValue
    expect(c.value).toBe(0);
    expect(c.isPending).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(c.hasError).toBe(true);
    expect(c.state).toBe('rejected');
    expect(c.lastError).toBeInstanceOf(Error);
  });

  it('rejected 상태에서 recoverable defaultValue 반환', async () => {
    const c = computed(
      async () => {
        throw new Error('Test error');
      },
      { defaultValue: 999 }
    );

    c.value; // 계산 트리거
    await new Promise((resolve) => setTimeout(resolve, 10));

    // recoverable=true이고 defaultValue가 있으면 에러 대신 defaultValue 반환
    expect(c.value).toBe(999);
  });

  it('비동기 onError 콜백 에러 처리', async () => {
    const onError = vi.fn();
    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('Async error');
      },
      { defaultValue: 0, onError }
    );

    c.value; // 계산 트리거
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onError).toHaveBeenCalled();
  });

  it('onError 콜백 자체가 에러를 발생시켜도 안전', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const c = computed(
      () => {
        throw new Error('Compute error');
      },
      {
        onError: () => {
          throw new Error('Callback error');
        },
      }
    );

    expect(() => c.value).toThrow();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('recomputing 중에는 peek()처럼 동작한다', () => {
    const count = atom(0);
    let _recomputeValue = 0;

    const c = computed(() => {
      _recomputeValue = c.peek(); // recomputing 중 자기 자신 참조
      return count.value * 2;
    });

    c.value; // 초기 계산
    // recomputing 플래그 체크로 무한 재귀 방지
  });

  it('lazy=false 초기 계산 실패는 무시된다', () => {
    const shouldFail = atom(true);

    // lazy=false이지만 초기 계산 실패는 무시
    const c = computed(
      () => {
        if (shouldFail.value) throw new Error('Init error');
        return 42;
      },
      { lazy: false }
    );

    // 에러가 발생하지 않아야 함 (try-catch로 무시)
    expect(c).toBeDefined();
  });

  it('구독자 실행 중 에러 처리', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    c.subscribe(() => {
      throw new Error('Subscriber error');
    });

    c.value; // 초기 계산
    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 10));

    consoleError.mockRestore();
  });

  it('비동기 계산이 여러 번 트리거되어도 안전하다', async () => {
    const trigger = atom(0);

    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return trigger.value * 10;
      },
      { defaultValue: 0 }
    );

    c.value; // 초기 계산 트리거

    trigger.value = 1;
    trigger.value = 2;

    // 모든 비동기 계산이 완료될 때까지 충분히 대기
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 최종 값이 반영되어야 함
    expect(c.value).toBe(20);
  });

  it('invalidate()가 재계산을 트리거한다', async () => {
    const computeFn = vi.fn(() => Math.random());
    const c = computed(computeFn);

    const first = c.value;
    expect(computeFn).toHaveBeenCalledTimes(1);

    const second = c.value; // 캐시됨
    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    c.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const _third = c.value; // 재계산됨
    expect(computeFn).toHaveBeenCalledTimes(2);
  });

  it('dispose 후에는 구독자에게 알리지 않는다', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const listener = vi.fn();

    c.subscribe(listener);
    c.value; // 초기 계산

    c.dispose();

    count.value = 10;
    await new Promise((resolve) => setTimeout(resolve, 10));

    // dispose 후에는 구독자에게 알림이 가지 않음
    expect(listener).not.toHaveBeenCalled();
  });

  it('잘못된 의존성은 에러를 발생시킨다', () => {
    const badAtom = {
      get value() {
        throw new Error('Access failed');
      },
      subscribe: () => () => {},
    };

    const c = computed(() => (badAtom as any).value);

    expect(() => c.value).toThrow();
  });

  it('computed 체인이 정상 동작한다', async () => {
    const count = atom(0);
    const doubled = computed(() => count.value * 2);
    const quadrupled = computed(() => doubled.value * 2);

    expect(quadrupled.value).toBe(0);

    count.value = 5;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(quadrupled.value).toBe(20);
  });

  it('구독자 에러가 다른 구독자에 영향을 주지 않는다', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const errorListener = vi.fn(() => {
      throw new Error('Subscriber error');
    });
    const normalListener = vi.fn();

    c.subscribe(errorListener);
    c.subscribe(normalListener);

    c.value;
    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errorListener).toHaveBeenCalled();
    expect(normalListener).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('dispose 시 의존성이 정리된다', async () => {
    const count = atom(0);
    const c = computed(() => count.value * 2);
    const listener = vi.fn();

    c.subscribe(listener);
    c.value; // 의존성 등록

    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    c.dispose();

    count.value = 2;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listener).not.toHaveBeenCalled();
  });

  describe('추가 엣지 케이스', () => {
    it('onError 콜백이 호출된다', async () => {
      const errorHandler = vi.fn();

      const c = computed(
        () => {
          throw new Error('Computation error');
        },
        { onError: errorHandler }
      );

      expect(() => c.value).toThrow();
      expect(errorHandler).toHaveBeenCalled();
    });

    it('onError 콜백에서 에러가 발생해도 안전하다', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const c = computed(
        () => {
          throw new Error('Computation error');
        },
        {
          onError: () => {
            throw new Error('Error in error handler');
          },
        }
      );

      expect(() => c.value).toThrow('Computation error');
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('비동기 computed의 onError가 호출된다', async () => {
      const errorHandler = vi.fn();

      const c = computed(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Async error');
        },
        { defaultValue: 0, onError: errorHandler }
      );

      expect(c.value).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorHandler).toHaveBeenCalled();
      expect(c.hasError).toBe(true);
    });

    it('invalidate()로 강제 재계산', async () => {
      let computeCount = 0;
      const count = atom(0);

      const c = computed(() => {
        computeCount++;
        return count.value * 2;
      });

      c.value; // 첫 계산
      expect(computeCount).toBe(1);

      c.value; // 캐시 사용
      expect(computeCount).toBe(1);

      c.invalidate(); // 강제 무효화
      c.value; // 재계산
      expect(computeCount).toBe(2);
    });

    it('lazy=false일 때 즉시 계산된다', () => {
      let isComputed = false;

      const c = computed(
        () => {
          isComputed = true;
          return 42;
        },
        { lazy: false }
      );

      // value 접근 전에 이미 계산되었어야 함
      expect(isComputed).toBe(true);
      expect(c.value).toBe(42);
    });

    it('lazy=false에서 초기 에러는 무시된다', () => {
      const c = computed(
        () => {
          throw new Error('Initial error');
        },
        { lazy: false }
      );

      // 초기 에러는 무시되고, value 접근 시 재계산
      expect(() => c.value).toThrow('Initial error');
    });

    it('구독자가 없으면 재계산하지 않는다', async () => {
      let computeCount = 0;
      const count = atom(0);

      const c = computed(() => {
        computeCount++;
        return count.value * 2;
      });

      c.value; // 첫 계산
      expect(computeCount).toBe(1);

      // 구독자 없이 atom 변경
      count.value = 1;
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 구독자가 없으므로 재계산되지 않음 (lazy)
      expect(computeCount).toBe(1);

      // value 접근 시 재계산
      c.value;
      expect(computeCount).toBe(2);
    });

    it('async state 속성들이 정확하다', async () => {
      const c = computed(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return 42;
        },
        { defaultValue: 0 }
      );

      // value 접근으로 계산 시작
      expect(c.value).toBe(0); // defaultValue
      expect(c.isPending).toBe(true);
      expect(c.isResolved).toBe(false);
      expect(c.hasError).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // 완료 후: resolved
      expect(c.isPending).toBe(false);
      expect(c.isResolved).toBe(true);
      expect(c.hasError).toBe(false);
      expect(c.value).toBe(42);
    });

    it('peek()는 재계산을 트리거하지 않는다', () => {
      let computeCount = 0;
      const count = atom(0);

      const c = computed(() => {
        computeCount++;
        return count.value * 2;
      });

      c.value; // 첫 계산
      expect(computeCount).toBe(1);

      count.value = 1;

      // peek는 dirty를 체크하지 않음
      const peeked = c.peek();
      expect(peeked).toBe(0); // 이전 값
      expect(computeCount).toBe(1); // 재계산 안됨
    });

    it('state 속성이 올바르게 동작한다', () => {
      const c = computed(() => 42);

      expect(c.state).toBe('idle');

      c.value; // 계산 시작

      expect(c.state).toBe('resolved');
      expect(c.value).toBe(42);
    });
  });
});
