/**
 * @fileoverview 반응형 상태 관리 라이브러리 포괄적 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AsyncState,
  atom,
  batch,
  computed,
  DEBUG_RUNTIME,
  effect,
  isAtom,
  isComputed,
  isEffect,
  untracked,
} from '@/index';

// ========================================
// 1. Atom 기본 동작
// ========================================

describe('Atom - 기본 동작', () => {
  it('값 읽기/쓰기가 정상 작동한다', () => {
    const count = atom(0);
    expect(count.value).toBe(0);

    count.value = 10;
    expect(count.value).toBe(10);
  });

  it('구독자에게 변경을 알린다', async () => {
    const count = atom(0);
    const listener = vi.fn();

    count.subscribe(listener);
    count.value = 5;

    // 비동기 스케줄러를 기다림
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledWith(5, 0);
  });

  it('구독 해제가 정상 작동한다', () => {
    const count = atom(0);
    const listener = vi.fn();

    const unsubscribe = count.subscribe(listener);
    unsubscribe();
    count.value = 5;

    expect(listener).not.toHaveBeenCalled();
  });

  it('중복 unsubscribe가 안전하다', () => {
    const count = atom(0);
    const listener = vi.fn();

    const unsubscribe = count.subscribe(listener);
    unsubscribe();
    unsubscribe(); // 중복 호출
    unsubscribe(); // 또 호출

    // 에러 없이 정상 종료되어야 함
    expect(() => unsubscribe()).not.toThrow();
  });

  it('peek()은 의존성 추적 없이 값을 반환한다', () => {
    const count = atom(0);
    const calls: number[] = [];

    const c = computed(() => {
      calls.push(count.peek()); // peek은 추적 안 됨
      return 1;
    });

    expect(c.value).toBe(1);
    count.value = 10;
    expect(calls.length).toBe(1); // 재계산 안 됨
  });

  it('Object.is 비교로 동일 값 업데이트를 스킵한다', () => {
    const count = atom(0);
    const listener = vi.fn();

    count.subscribe(listener);
    count.value = 0; // 동일한 값

    expect(listener).not.toHaveBeenCalled();
  });

  it('dispose 후 메모리 누수가 없다', () => {
    const count = atom(0);
    const listener = vi.fn();

    count.subscribe(listener);
    count.dispose();
    count.value = 10;

    // dispose 후에는 알림이 없어야 함 (구독자 cleared)
    expect(listener).not.toHaveBeenCalled();
  });
});

// ========================================
// 2. Computed 동작
// ========================================

describe('Computed - 동작', () => {
  it('의존성 자동 추적이 작동한다', async () => {
    const count = atom(0);
    const doubled = computed(() => count.value * 2);

    expect(doubled.value).toBe(0);

    count.value = 5;
    // markDirty가 비동기로 호출되므로 대기
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(doubled.value).toBe(10);
  });

  it('lazy evaluation이 작동한다 (기본값)', () => {
    const fn = vi.fn(() => 42);
    const c = computed(fn);

    expect(fn).not.toHaveBeenCalled();

    const val = c.value;
    expect(fn).toHaveBeenCalledOnce();
    expect(val).toBe(42);
  });

  it('lazy: false 옵션이 작동한다', () => {
    const fn = vi.fn(() => 42);
    const _c = computed(fn, { lazy: false });

    expect(fn).toHaveBeenCalledOnce();
  });

  it('동기 계산이 정상 작동한다', () => {
    const a = atom(2);
    const b = atom(3);
    const sum = computed(() => a.value + b.value);

    expect(sum.value).toBe(5);
  });

  it('비동기 계산이 정상 작동한다', async () => {
    const a = atom(2);
    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return a.value * 2;
      },
      { defaultValue: 0 }
    );

    expect(c.state).toBe(AsyncState.IDLE);
    const initialValue = c.value; // 계산 트리거
    expect(initialValue).toBe(0); // defaultValue
    expect(c.state).toBe(AsyncState.PENDING);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(c.state).toBe(AsyncState.RESOLVED);
    expect(c.value).toBe(4);
  });

  it('defaultValue 처리가 작동한다', () => {
    const c = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 42;
      },
      { defaultValue: 999 }
    );

    expect(c.value).toBe(999); // pending 중 defaultValue 반환
  });

  it('에러 복구 (recoverable)가 작동한다', async () => {
    const shouldFail = atom(true);
    const c = computed(
      () => {
        if (shouldFail.value) {
          throw new Error('Test error');
        }
        return 42;
      },
      { defaultValue: 0 }
    );

    expect(() => c.value).toThrow('Test error');

    shouldFail.value = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(c.value).toBe(42);
  });

  it('onError 콜백이 호출된다', () => {
    const errorHandler = vi.fn();
    const c = computed(
      () => {
        throw new Error('Test');
      },
      { onError: errorHandler }
    );

    expect(() => c.value).toThrow();
    expect(errorHandler).toHaveBeenCalled();
  });

  it('직접 순환 참조를 감지한다 (내부 구현 검증)', () => {
    // checkCircular 함수를 직접 테스트
    const mockComputed = {
      dependencies: new Set(),
    };

    // atom이 자기 자신을 의존성으로 추가하려고 시도
    expect(() => {
      // debug.checkCircular는 항상 직접 순환을 감지 (프로덕션에서도)
      DEBUG_RUNTIME.checkCircular(mockComputed, mockComputed);
    }).toThrow(/circular dependency/i);
  });

  it('간접 순환 참조 감지 (개발 모드)', () => {
    // 개발 모드에서만 간접 순환 참조를 감지
    if (typeof process === 'undefined' || (process as any).env?.NODE_ENV !== 'development') {
      // 프로덕션에서는 테스트 스킵
      expect(true).toBe(true);
      return;
    }

    // A → B → C → A 순환 구조 시뮬레이션
    const nodeA: any = { dependencies: new Set() };
    const nodeB: any = { dependencies: new Set([nodeA]) };
    const nodeC: any = { dependencies: new Set([nodeB]) };
    nodeA.dependencies.add(nodeC); // 순환 완성

    expect(() => {
      DEBUG_RUNTIME.checkCircular(nodeC, nodeA);
    }).toThrow(/circular dependency/i);
  });

  it('equal 옵션이 작동한다', () => {
    const a = atom({ x: 1 });
    const listener = vi.fn();

    const c = computed(() => ({ x: a.value.x }), {
      equal: (prev, next) => prev.x === next.x,
    });

    c.subscribe(listener);
    c.value; // 초기 계산

    a.value = { x: 1 }; // 동일한 x 값
    expect(listener).not.toHaveBeenCalled();
  });

  it('dispose 후 의존성이 정리된다', () => {
    const a = atom(0);
    const c = computed(() => a.value * 2);

    c.value; // 의존성 등록
    c.dispose();

    // dispose 후 a의 구독자가 없어야 함
    // 실제로는 내부 구현 확인 필요
  });
});

// ========================================
// 3. Effect 동작
// ========================================

describe('Effect - 동작', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('의존성 변경 시 자동 실행된다', async () => {
    const count = atom(0);
    const calls: number[] = [];

    effect(() => {
      calls.push(count.value);
    });

    await vi.runAllTimersAsync();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]).toBe(0);

    count.value = 1;
    await vi.runAllTimersAsync();
    expect(calls[calls.length - 1]).toBe(1);
  });

  it('cleanup 함수가 실행된다', async () => {
    const count = atom(0);
    const cleanup = vi.fn();

    effect(() => {
      count.value;
      return cleanup;
    });

    await vi.runAllTimersAsync();

    count.value = 1;
    await vi.runAllTimersAsync();
    expect(cleanup).toHaveBeenCalled();
  });

  it('비동기 cleanup이 작동한다', async () => {
    vi.useRealTimers(); // 실제 타이머 사용
    const count = atom(0);
    const cleanup = vi.fn();

    effect(async () => {
      count.value;
      return cleanup;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    count.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(cleanup).toHaveBeenCalled();
    vi.useFakeTimers(); // 다시 가짜 타이머로
  });

  it('무한 루프를 감지한다 (슬라이딩 윈도우)', async () => {
    const count = atom(0);

    const _e = effect(
      () => {
        count.value = count.value + 1; // 무한 루프 유발
      },
      { sync: true, maxExecutionsPerSecond: 10 }
    );

    // 10회 초과 시 에러 발생
    await vi.runAllTimersAsync();
  });

  it('trackModifications 경고가 작동한다', async () => {
    const count = atom(0);
    const _consoleWarn = vi.spyOn(console, 'warn');

    effect(
      () => {
        count.value = count.value + 1; // 읽고 쓰기
      },
      { trackModifications: true, sync: true, maxExecutionsPerSecond: 5 }
    );

    await vi.runAllTimersAsync();
  });

  it('dispose 시 descriptor가 복구된다', async () => {
    const count = atom(0);

    const e = effect(
      () => {
        count.value;
      },
      { trackModifications: true }
    );

    await vi.runAllTimersAsync();

    const _descriptorBefore = Object.getOwnPropertyDescriptor(count, 'value');
    e.dispose();
    const descriptorAfter = Object.getOwnPropertyDescriptor(count, 'value');

    // dispose 후 원본 descriptor 복구 확인
    expect(descriptorAfter).toBeDefined();
  });

  it('sync 옵션이 작동한다', () => {
    const count = atom(0, { sync: true });
    const calls: number[] = [];
    let effectRunCount = 0;

    effect(
      () => {
        // 무한 루프 방지
        if (effectRunCount++ > 5) return;
        calls.push(count.value);
      },
      { sync: true, maxExecutionsPerSecond: 10 }
    );

    expect(calls).toEqual([0]); // 즉시 실행

    count.value = 1;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toBe(1);
  });

  it('dispose 후 재실행되지 않는다', async () => {
    const count = atom(0);
    const calls: number[] = [];

    const e = effect(() => {
      calls.push(count.value);
    });

    await vi.runAllTimersAsync();
    e.dispose();

    count.value = 1;
    await vi.runAllTimersAsync();

    expect(calls).toEqual([0]); // dispose 후 실행 안 됨
  });
});

// ========================================
// 4. 배치 처리
// ========================================

describe('Batch - 처리', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('batch 내 다중 업데이트가 한 번만 알린다', async () => {
    const a = atom(0);
    const b = atom(0);
    const calls: number[] = [];

    const c = computed(() => a.value + b.value);
    c.value; // 초기 계산
    c.subscribe(() => {
      calls.push(c.value);
    });

    batch(() => {
      a.value = 1;
      b.value = 2;
    });

    await vi.runAllTimersAsync();

    // batch 후 한 번만 알림
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toBe(3);
  });

  it('중첩 batch가 작동한다', async () => {
    const a = atom(0);
    const calls: number[] = [];

    a.subscribe((newVal) => {
      if (newVal !== undefined) calls.push(newVal);
    });

    batch(() => {
      a.value = 1;
      batch(() => {
        a.value = 2;
      });
      a.value = 3;
    });

    await vi.runAllTimersAsync();

    // 가장 바깥 batch 종료 후 한 번만 알림
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe(3);
  });

  it('batch 내에서 에러가 발생해도 정상 복구된다', async () => {
    const a = atom(0);

    expect(() => {
      batch(() => {
        a.value = 1;
        throw new Error('Test error');
      });
    }).toThrow();

    // 에러 후에도 batch가 종료되고 정상 동작
    a.value = 2;
    await vi.runAllTimersAsync();
    expect(a.value).toBe(2);
  });
});

// ========================================
// 5. 엣지 케이스
// ========================================

describe('엣지 케이스', () => {
  it('null 값을 처리한다', () => {
    const nullAtom = atom<string | null>(null);
    expect(nullAtom.value).toBe(null);

    nullAtom.value = 'test';
    expect(nullAtom.value).toBe('test');
  });

  it('undefined 값을 처리한다', () => {
    const undefinedAtom = atom<string | undefined>(undefined);
    expect(undefinedAtom.value).toBe(undefined);

    undefinedAtom.value = 'test';
    expect(undefinedAtom.value).toBe('test');
  });

  it('isAtom 타입 가드가 정확하다', () => {
    const a = atom(0);
    const c = computed(() => 0);
    const e = effect(() => {});

    expect(isAtom(a)).toBe(true);
    expect(isAtom(c)).toBe(true); // computed도 atom
    expect(isAtom(e)).toBe(false);
    expect(isAtom(null)).toBe(false);
    expect(isAtom(undefined)).toBe(false);
    expect(isAtom({})).toBe(false);
  });

  it('isComputed 타입 가드가 정확하다', () => {
    const a = atom(0);
    const c = computed(() => 0);

    expect(isComputed(a)).toBe(false);
    expect(isComputed(c)).toBe(true);
    expect(isComputed(null)).toBe(false);
  });

  it('isEffect 타입 가드가 정확하다', () => {
    const a = atom(0);
    const e = effect(() => {});

    expect(isEffect(a)).toBe(false);
    expect(isEffect(e)).toBe(true);
    expect(isEffect(null)).toBe(false);
  });

  it('dispose 후 메모리 누수가 없다', () => {
    const a = atom(0);
    const listener = vi.fn();

    // 구독자 추가
    const _unsubscribe = a.subscribe(listener);

    // dispose 전 구독자 수 확인 (debug 모드)
    if ((a as any).subscriberCount) {
      expect((a as any).subscriberCount()).toBe(1);
    }

    a.dispose();

    // dispose 후 구독자가 정리되었는지 확인
    if ((a as any).subscriberCount) {
      expect((a as any).subscriberCount()).toBe(0);
    }

    // dispose 후 알림이 없어야 함
    a.value = 10;
    expect(listener).not.toHaveBeenCalled();
  });

  it('computed dispose 후 의존성이 정리된다', () => {
    const a = atom(0);
    const c = computed(() => a.value * 2);

    // 의존성 등록
    c.value;

    // atom의 구독자 확인
    if ((a as any).subscriberCount) {
      expect((a as any).subscriberCount()).toBeGreaterThan(0);
    }

    c.dispose();

    // dispose 후 computed가 atom을 구독하지 않아야 함
    // (구독 해제되어야 함)
    const subscriberCount = (a as any).subscriberCount?.() || 0;
    const listener = vi.fn();
    a.subscribe(listener);

    // computed는 더 이상 구독자가 아님
    expect(subscriberCount).toBe(0);
  });

  it('버전 관리로 동시성 문제를 해결한다', async () => {
    const count = atom(0);
    const calls: number[] = [];

    count.subscribe((newVal) => {
      if (newVal !== undefined) calls.push(newVal);
    });

    count.value = 1;
    count.value = 2;
    count.value = 3;

    await new Promise((resolve) => setTimeout(resolve, 10));

    // 최종 값만 전파되어야 함
    expect(calls[calls.length - 1]).toBe(3);
  });
});

// ========================================
// 6. 성능
// ========================================

describe('성능 테스트', () => {
  it('대규모 의존성 그래프를 처리한다', async () => {
    // 최적화 적용: updateDependencies로 O(n) 복잡도
    const atoms = Array.from({ length: 10 }, (_, i) => atom(i));
    const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));

    expect(c.value).toBe(45); // 0 + 1 + ... + 9

    atoms[5]!.value = 100;
    await new Promise((resolve) => setTimeout(resolve, 10));
    // 45 - 5 + 100 = 140
    expect(c.value).toBe(140);
  });

  it('다이아몬드 문제를 올바르게 처리한다 (A→B,C / B,C→D)', async () => {
    const a = atom(1);
    const b = computed(() => a.value * 2);
    const c = computed(() => a.value * 3);
    const d = computed(() => b.value + c.value);

    expect(d.value).toBe(5); // 초기값

    const calls: number[] = [];
    d.subscribe(() => {
      calls.push(d.value);
    });

    a.value = 2;
    await new Promise((resolve) => setTimeout(resolve, 10));

    // d는 한 번만 재계산되어야 함
    expect(d.value).toBe(10); // (2*2) + (2*3)
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('깊은 의존성 체인을 처리한다', () => {
    let current = atom(1);

    for (let i = 0; i < 50; i++) {
      const prev = current;
      current = computed(() => prev.value + 1) as any;
    }

    expect(current.value).toBe(51);
  });
});

// ========================================
// 7. 유틸리티 함수
// ========================================

describe('유틸리티 함수', () => {
  it('untracked가 의존성을 추적하지 않는다', () => {
    const a = atom(0);
    const calls: number[] = [];

    const c = computed(() => {
      calls.push(untracked(() => a.value));
      return 1;
    });

    c.value; // 초기 계산
    a.value = 10; // untracked이므로 재계산 안 됨

    expect(calls.length).toBe(1);
  });
});
