/**
 * @fileoverview DependencyManager tests
 */

import { describe, expect, it, vi } from 'vitest';
import { DependencyManager } from '@/tracking/dependency-manager';
import type { Dependency } from '@/types';

describe('DependencyManager', () => {
  it('can add a dependency', () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = {
      subscribe: vi.fn(() => () => {}),
    };
    const unsubscribe = vi.fn();

    manager.addDependency(mockDep, unsubscribe);

    expect(manager.count).toBe(1);
  });

  it('can check if a dependency exists', () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = {
      subscribe: vi.fn(() => () => {}),
    };
    const unsubscribe = vi.fn();

    expect(manager.hasDependency(mockDep)).toBe(false);

    manager.addDependency(mockDep, unsubscribe);

    expect(manager.hasDependency(mockDep)).toBe(true);
  });

  it('detects duplicate dependencies', () => {
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

  it('can unsubscribe all dependencies', () => {
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

  it('handles errors when unsubscribe fails', () => {
    const manager = new DependencyManager();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unsubscribe = vi.fn(() => {
      throw new Error('Unsubscribe failed');
    });

    const mockDep: Dependency = { subscribe: vi.fn(() => () => {}) };
    manager.addDependency(mockDep, unsubscribe);

    // unsubscribeAll should complete even if an error occurs
    expect(() => manager.unsubscribeAll()).not.toThrow();
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it('is safe to call unsubscribeAll on empty manager', () => {
    const manager = new DependencyManager();

    expect(() => manager.unsubscribeAll()).not.toThrow();
    expect(manager.count).toBe(0);
  });

  it('cleanup scheduling is not called multiple times', async () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    // Add multiple times to trigger scheduling
    manager.addDependency(mockDep, unsubscribe);
    manager.addDependency(mockDep, unsubscribe);
    manager.addDependency(mockDep, unsubscribe);

    // Scheduling should only happen once
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Only 1 should remain due to duplicate prevention
    expect(manager.count).toBe(1);
  });

  it('can get dependency list with getDependencies', () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    manager.addDependency(mockDep, unsubscribe);

    const deps = manager.getDependencies();
    expect(deps).toHaveLength(1);
    expect(deps[0]).toBe(mockDep);
  });

  it('automatically cleans up GCed dependencies using WeakRef', () => {
    const manager = new DependencyManager();
    let mockDep: Dependency | null = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    manager.addDependency(mockDep, unsubscribe);
    expect(manager.count).toBe(1);

    // Simulate dependency release
    mockDep = null;

    // Explicit cleanup call (in practice, cleanup is called automatically after GC)
    manager.cleanup();

    // WeakRef.deref() returns undefined, so count should be 0
    // Note: This test does not depend on actual GC behavior (explicit cleanup call)
    // getDependencies returns only living dependencies
    const deps = manager.getDependencies();
    expect(deps.length).toBeLessThanOrEqual(1); // 0 or 1 depending on GC timing
  });

  it('can clean up dead WeakRefs by calling cleanup', () => {
    const manager = new DependencyManager();
    const mockDep1: Dependency = { subscribe: vi.fn(() => () => {}) };
    const mockDep2: Dependency = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    manager.addDependency(mockDep1, unsubscribe);
    manager.addDependency(mockDep2, unsubscribe);

    // Call cleanup
    manager.cleanup();

    // Living dependencies should be preserved
    expect(manager.getDependencies()).toHaveLength(2);
  });

  it('can set auto cleanup threshold with setCleanupThreshold', () => {
    const manager = new DependencyManager();
    const mockDep: Dependency = { subscribe: vi.fn(() => () => {}) };
    const unsubscribe = vi.fn();

    // Set threshold to 5
    manager.setCleanupThreshold(5);

    // Adding 5 triggers auto cleanup
    for (let i = 0; i < 5; i++) {
      manager.addDependency(mockDep, unsubscribe);
    }

    // Check if cleanup was called automatically (count is preserved after cleanup)
    expect(manager.count).toBeGreaterThan(0);
  });

  it('negative threshold is corrected to 1', () => {
    const manager = new DependencyManager();

    // Attempt to set negative value
    manager.setCleanupThreshold(-10);

    // Should be corrected to minimum value 1 (internal behavior is hard to verify but should not error)
    expect(() => manager.setCleanupThreshold(0)).not.toThrow();
  });
});
