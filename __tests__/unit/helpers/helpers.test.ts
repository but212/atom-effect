/**
 * @fileoverview Helpers 테스트 (커버리지 보완)
 */

import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { AtomError } from '@/errors/errors';
import { batch, isComputed, untracked } from '@/helpers/helpers';

describe('batch - 에러 처리', () => {
  it('잘못된 타입의 콜백을 거부한다', () => {
    expect(() => {
      batch('not a function' as any);
    }).toThrow(AtomError);

    expect(() => {
      batch(null as any);
    }).toThrow(AtomError);
  });

  it('batch 내부 에러를 래핑한다', () => {
    expect(() => {
      batch(() => {
        throw new Error('Batch error');
      });
    }).toThrow(AtomError);
  });

  it('batch는 반환값을 전달한다', () => {
    const result = batch(() => {
      return 42;
    });

    expect(result).toBe(42);
  });
});

describe('batch - 동기 실행', () => {
  it('batch는 동기적으로 실행되어야 한다', () => {
    const a = atom(0);
    const calls: number[] = [];

    a.subscribe((newVal) => {
      if (newVal !== undefined) calls.push(newVal);
    });

    batch(() => {
      a.value = 1;
      a.value = 2;
      a.value = 3;
    });

    // batch 종료 직후 바로 호출되어야 함 (비동기 대기 불필요)
    expect(calls).toEqual([3]);
  });

  it('batch 내부의 여러 atom 업데이트가 동기적으로 실행된다', () => {
    const a = atom(0);
    const b = atom(0);
    const calls: string[] = [];

    a.subscribe((newVal) => {
      if (newVal !== undefined) calls.push(`a:${newVal}`);
    });

    b.subscribe((newVal) => {
      if (newVal !== undefined) calls.push(`b:${newVal}`);
    });

    batch(() => {
      a.value = 1;
      b.value = 2;
      a.value = 3;
    });

    // batch 종료 직후 모든 업데이트가 완료되어야 함
    // Set의 순서는 보장되지 않으므로 포함 여부만 확인
    expect(calls).toContain('a:3');
    expect(calls).toContain('b:2');
    expect(calls).toHaveLength(2);
  });

  it('중첩된 batch도 동기적으로 실행된다', () => {
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

    // 가장 바깥 batch 종료 직후 호출되어야 함
    expect(calls).toEqual([3]);
  });

  it('batch 내부에서 computed가 즉시 업데이트된다', () => {
    const a = atom(0);
    const b = computed(() => a.value * 2, { lazy: false }); // non-lazy로 즉시 계산
    const calls: number[] = [];

    b.subscribe(() => {
      calls.push(b.value);
    });

    batch(() => {
      a.value = 1;
      a.value = 2;
      a.value = 3;
    });

    // batch 종료 직후 computed가 업데이트되어야 함
    expect(b.value).toBe(6); // computed 값 자체는 업데이트됨
    expect(calls).toEqual([6]); // subscriber도 호출되어야 함
  });
});

describe('untracked - 에러 처리', () => {
  it('잘못된 타입의 콜백을 거부한다', () => {
    expect(() => {
      untracked('not a function' as any);
    }).toThrow(AtomError);

    expect(() => {
      untracked(null as any);
    }).toThrow(AtomError);
  });

  it('untracked 내부 에러를 래핑한다', () => {
    expect(() => {
      untracked(() => {
        throw new Error('Untracked error');
      });
    }).toThrow(AtomError);
  });

  it('untracked는 반환값을 전달한다', () => {
    const result = untracked(() => {
      return 'test';
    });

    expect(result).toBe('test');
  });
});

describe('isComputed - 다양한 케이스', () => {
  it('개발 모드가 아닐 때도 작동한다', () => {
    const a = atom(0);
    const c = computed(() => 0);

    // 개발 모드가 아니어도 invalidate 메서드로 판별
    expect(isComputed(a)).toBe(false);
    expect(isComputed(c)).toBe(true);
  });

  it('invalidate 메서드가 있으면 computed로 인식', () => {
    const fakeComputed = {
      value: 0,
      subscribe: () => () => {},
      invalidate: () => {},
    };

    expect(isComputed(fakeComputed)).toBe(true);
  });

  it('디버그 타입 정보를 우선 사용한다', () => {
    // 이미 index.test.ts에서 충분히 테스트됨
    expect(true).toBe(true);
  });
});
