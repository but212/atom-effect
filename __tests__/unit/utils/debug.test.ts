/**
 * @fileoverview Debug 유틸리티 테스트 (커버리지 보완)
 */

import { describe, expect, it, vi } from 'vitest';
import { ComputedError } from '@/errors/errors';
import { DEBUG_ID, DEBUG_NAME, DEBUG_TYPE, debug, NO_DEFAULT_VALUE } from '@/utils/debug';

describe('debug 설정', () => {
  it('개발 모드 감지가 작동한다', () => {
    // NODE_ENV에 따라 enabled가 설정됨
    expect(typeof debug.enabled).toBe('boolean');
  });

  it('maxDependencies 기본값이 설정되어 있다', () => {
    expect(debug.maxDependencies).toBe(1000);
  });

  it('warnInfiniteLoop 기본값이 true다', () => {
    expect(debug.warnInfiniteLoop).toBe(true);
  });
});

describe('debug.warn', () => {
  it('조건이 true일 때 경고를 출력한다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.warn(true, 'Test warning');

    expect(consoleWarn).toHaveBeenCalledWith('[Reactive Atom] Test warning');

    consoleWarn.mockRestore();
    debug.enabled = originalEnabled;
  });

  it('조건이 false면 경고를 출력하지 않는다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.warn(false, 'Should not warn');

    expect(consoleWarn).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    debug.enabled = originalEnabled;
  });

  it('개발 모드가 아니면 경고를 출력하지 않는다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.warn(true, 'Should not warn in production');

    expect(consoleWarn).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    debug.enabled = originalEnabled;
  });
});

describe('debug.checkCircular', () => {
  it('직접 순환 참조를 감지한다', () => {
    const node = {};

    expect(() => {
      debug.checkCircular(node, node);
    }).toThrow(ComputedError);

    expect(() => {
      debug.checkCircular(node, node);
    }).toThrow(/circular dependency/i);
  });

  it('간접 순환 참조를 감지한다 (개발 모드)', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const nodeA: any = { dependencies: new Set() };
    const nodeB: any = { dependencies: new Set([nodeA]) };
    const nodeC: any = { dependencies: new Set([nodeB]) };
    nodeA.dependencies.add(nodeC); // A → C → B → A

    expect(() => {
      debug.checkCircular(nodeC, nodeA);
    }).toThrow(ComputedError);

    debug.enabled = originalEnabled;
  });

  it('프로덕션 모드에서는 간접 순환 참조를 검사하지 않는다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;

    const nodeA: any = { dependencies: new Set() };
    const nodeB: any = { dependencies: new Set([nodeA]) };
    const nodeC: any = { dependencies: new Set([nodeB]) };
    nodeA.dependencies.add(nodeC);

    // 프로덕션에서는 에러가 발생하지 않음 (성능을 위해)
    // 단, 직접 순환은 여전히 감지됨
    expect(() => {
      debug.checkCircular(nodeB, nodeA); // 간접 순환
    }).not.toThrow();

    debug.enabled = originalEnabled;
  });

  it('dependencies가 없는 노드도 처리한다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const node1 = {};
    const node2 = { dependencies: new Set() };

    expect(() => {
      debug.checkCircular(node1, node2);
    }).not.toThrow();

    debug.enabled = originalEnabled;
  });

  it('visited Set이 제공되면 재귀적으로 검사한다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const visited = new Set();
    const node = {};

    debug.checkCircular(node, {}, visited);
    expect(visited.has(node)).toBe(true);

    debug.enabled = originalEnabled;
  });
});

describe('debug.attachDebugInfo', () => {
  it('개발 모드에서 디버그 정보를 첨부한다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj: any = {};
    debug.attachDebugInfo(obj, 'test', 123);

    expect(obj[DEBUG_NAME]).toBe('test_123');
    expect(obj[DEBUG_ID]).toBe(123);
    expect(obj[DEBUG_TYPE]).toBe('test');

    debug.enabled = originalEnabled;
  });

  it('프로덕션 모드에서는 디버그 정보를 첨부하지 않는다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = false;

    const obj: any = {};
    debug.attachDebugInfo(obj, 'test', 456);

    expect(obj[DEBUG_NAME]).toBeUndefined();
    expect(obj[DEBUG_ID]).toBeUndefined();
    expect(obj[DEBUG_TYPE]).toBeUndefined();

    debug.enabled = originalEnabled;
  });
});

describe('debug.getDebugName', () => {
  it('디버그 이름을 반환한다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj: any = {};
    debug.attachDebugInfo(obj, 'atom', 1);

    expect(debug.getDebugName(obj)).toBe('atom_1');

    debug.enabled = originalEnabled;
  });

  it('디버그 정보가 없으면 undefined를 반환한다', () => {
    const obj = {};
    expect(debug.getDebugName(obj)).toBeUndefined();
  });

  it('null이나 undefined도 처리한다', () => {
    expect(debug.getDebugName(null)).toBeUndefined();
    expect(debug.getDebugName(undefined)).toBeUndefined();
  });
});

describe('debug.getDebugType', () => {
  it('디버그 타입을 반환한다', () => {
    const originalEnabled = debug.enabled;
    debug.enabled = true;

    const obj: any = {};
    debug.attachDebugInfo(obj, 'computed', 2);

    expect(debug.getDebugType(obj)).toBe('computed');

    debug.enabled = originalEnabled;
  });

  it('디버그 정보가 없으면 undefined를 반환한다', () => {
    const obj = {};
    expect(debug.getDebugType(obj)).toBeUndefined();
  });

  it('null이나 undefined도 처리한다', () => {
    expect(debug.getDebugType(null)).toBeUndefined();
    expect(debug.getDebugType(undefined)).toBeUndefined();
  });
});

describe('NO_DEFAULT_VALUE Symbol', () => {
  it('unique Symbol이다', () => {
    expect(typeof NO_DEFAULT_VALUE).toBe('symbol');
  });

  it('다른 값과 구별된다', () => {
    expect(NO_DEFAULT_VALUE).not.toBe(undefined);
    expect(NO_DEFAULT_VALUE).not.toBe(null);
    expect(NO_DEFAULT_VALUE).not.toBe(0);
    expect(NO_DEFAULT_VALUE).not.toBe(false);
  });
});
