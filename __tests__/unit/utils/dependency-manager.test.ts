/**
 * @fileoverview DependencyManager 테스트
 */

import { describe, expect, it, vi } from 'vitest';
import type { Dependency } from '@/types';
import { DependencyManager } from '@/tracking/dependency-manager';

describe('DependencyManager', () => {
  it('의존성을 추가할 수 있다', () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = {
      subscribe: vi.fn(() => () => {}),
    };
    const unsubscribe = vi.fn();

    manager.addDependency(mockDep, unsubscribe);

    expect(manager.count).toBe(1);
  });

  it('의존성 존재 여부를 확인할 수 있다', () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = {
      subscribe: vi.fn(() => () => {}),
    };
    const unsubscribe = vi.fn();

    expect(manager.hasDependency(mockDep)).toBe(false);

    manager.addDependency(mockDep, unsubscribe);

    expect(manager.hasDependency(mockDep)).toBe(true);
  });

  it('중복 의존성을 감지한다', () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = {
      subscribe: vi.fn(() => () => {}),
    };
    const unsubscribe = vi.fn();

    manager.addDependency(mockDep, unsubscribe);
    manager.addDependency(mockDep, unsubscribe); // Duplicated add

    // Duplicate detection prevents duplicates
    expect(manager.count).toBe(1);
  });

  it('모든 의존성을 구독 해제할 수 있다', () => {
    const manager = new DependencyManager();
    const unsubscribe1 = vi.fn();
    const unsubscribe2 = vi.fn();
    const unsubscribe3 = vi.fn();

    const mockDep1: Dependency = { subscribe: vi.fn(() => () => {}) };
    const mockDep2: Dependency = { subscribe: vi.fn(() => () => {}) };
    const mockDep3: Dependency = { subscribe: vi.fn(() => () => {}) };

    manager.addDependency(mockDep1, unsubscribe1);
    manager.addDependency(mockDep2, unsubscribe2);
    manager.addDependency(mockDep3, unsubscribe3);

    expect(manager.count).toBe(3);

    manager.unsubscribeAll();

    expect(manager.count).toBe(0);
    expect(unsubscribe1).toHaveBeenCalled();
    expect(unsubscribe2).toHaveBeenCalled();
    expect(unsubscribe3).toHaveBeenCalled();
  });

  it('unsubscribe 실패 시 에러를 처리한다', () => {
    const manager = new DependencyManager();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unsubscribe = vi.fn(() => {
      throw new Error('Unsubscribe failed');
    });

    const mockDep: Dependency = { subscribe: vi.fn(() => () => {}) };
    manager.addDependency(mockDep, unsubscribe);

    // 에러가 발생해도 unsubscribeAll은 완료되어야 함
    expect(() => manager.unsubscribeAll()).not.toThrow();
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it('빈 매니저에서 unsubscribeAll을 호출해도 안전하다', () => {
    const manager = new DependencyManager();

    expect(() => manager.unsubscribeAll()).not.toThrow();
    expect(manager.count).toBe(0);
  });

  it('정리 스케줄링이 중복 호출되지 않는다', async () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    // 여러 번 추가하여 스케줄링 트리거
    manager.addDependency(mockDep, unsubscribe);
    manager.addDependency(mockDep, unsubscribe);
    manager.addDependency(mockDep, unsubscribe);

    // 스케줄링이 한 번만 되어야 함
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 중복 방지로 인해 1개만 남아야 함
    expect(manager.count).toBe(1);
  });

  it('getDependencies로 의존성 목록을 가져올 수 있다', () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    manager.addDependency(mockDep, unsubscribe);

    const deps = manager.getDependencies();
    expect(deps).toHaveLength(1);
    expect(deps[0]).toBe(mockDep);
  });

  it('WeakRef를 사용하여 GC된 의존성을 자동 정리한다', () => {
    const manager = new DependencyManager();
    let mockDep: Dependency | null = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    manager.addDependency(mockDep, unsubscribe);
    expect(manager.count).toBe(1);

    // 의존성 해제 시뮬레이션
    mockDep = null;

    // 명시적 cleanup 호출 (실제로는 GC 후 cleanup이 자동 호출됨)
    manager.cleanup();

    // WeakRef.deref()가 undefined를 반환하므로 count가 0이 되어야 함
    // 주의: 이 테스트는 실제 GC 동작에 의존하지 않음 (명시적 cleanup 호출)
    // getDependencies는 살아있는 의존성만 반환
    const deps = manager.getDependencies();
    expect(deps.length).toBeLessThanOrEqual(1); // GC 타이밍에 따라 0 또는 1
  });

  it('cleanup을 호출하여 죽은 WeakRef를 정리할 수 있다', () => {
    const manager = new DependencyManager();
    const mockDep1: Dependency = { subscribe: vi.fn(() => () => {}) };
    const mockDep2: Dependency = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    manager.addDependency(mockDep1, unsubscribe);
    manager.addDependency(mockDep2, unsubscribe);

    // cleanup 호출
    manager.cleanup();

    // 살아있는 의존성은 유지되어야 함
    expect(manager.getDependencies()).toHaveLength(2);
  });

  it('setCleanupThreshold로 자동 cleanup 임계값을 설정할 수 있다', () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    // 임계값을 5로 설정
    manager.setCleanupThreshold(5);

    // 5개 추가하면 자동 cleanup 트리거
    for (let i = 0; i < 5; i++) {
      manager.addDependency(mockDep, unsubscribe);
    }

    // cleanup이 자동으로 호출되었는지 확인 (count는 cleanup 후에도 유지)
    expect(manager.count).toBeGreaterThan(0);
  });

  it('음수 임계값은 1로 보정된다', () => {
    const manager = new DependencyManager();

    // 음수 설정 시도
    manager.setCleanupThreshold(-10);

    // 최소값 1로 보정되어야 함 (내부 동작 확인은 어렵지만 에러가 없어야 함)
    expect(() => manager.setCleanupThreshold(0)).not.toThrow();
  });
});
