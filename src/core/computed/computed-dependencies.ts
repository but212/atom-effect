/**
 * @fileoverview Computed dependency management
 */

import { ComputedError, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import type { DependencyManager } from '../../tracking/dependency-manager';
import type { Dependency } from '../../types';
import { debug } from '../../utils/debug';

/**
 * Dependency synchronization manager
 * Uses delta sync algorithm to minimize subscription churn
 */
export class DependencySyncManager {
  constructor(
    private dependencyManager: DependencyManager,
    private computedObject: unknown,
    private markDirty: () => void
  ) {}

  /**
   * Updates dependencies using delta sync algorithm
   * Only subscribes/unsubscribes changed dependencies for optimal performance
   *
   * @param newDeps Set of new dependencies detected during computation
   */
  update(newDeps: Set<unknown>): void {
    const dependencies = this.dependencyManager.getDependencies();

    // Fast path: No dependency changes (O(1) check)
    if (this.hasSameDependencies(dependencies, newDeps)) {
      return; // No changes, early exit
    }

    // Slow path: Delta Sync - WeakMap handles automatic GC
    this.performDeltaSync(dependencies, newDeps);
  }

  /**
   * Fast path: Checks if dependencies are identical
   * O(n) comparison but avoids expensive subscription operations
   */
  private hasSameDependencies(current: Dependency[], newDeps: Set<unknown>): boolean {
    if (current.length !== newDeps.size) {
      return false;
    }

    for (let i = 0; i < current.length; i++) {
      if (!newDeps.has(current[i]!)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Performs delta synchronization of dependencies
   * Unsubscribes from removed dependencies and subscribes to new ones
   */
  private performDeltaSync(current: Dependency[], newDeps: Set<unknown>): void {
    const existingSet = new Set(current);
    const toRemove: Dependency[] = [];
    const toAdd: Dependency[] = [];

    // Find dependencies to remove
    for (let i = 0; i < current.length; i++) {
      const dep = current[i]!;
      if (!newDeps.has(dep)) {
        toRemove.push(dep);
      }
    }

    // Find dependencies to add
    newDeps.forEach((dep) => {
      if (!existingSet.has(dep as Dependency)) {
        toAdd.push(dep as Dependency);
      }
    });

    // Unsubscribe only removed dependencies
    for (let i = 0; i < toRemove.length; i++) {
      this.dependencyManager.removeDependency(toRemove[i]!);
    }

    // Subscribe only to new dependencies
    for (let i = 0; i < toAdd.length; i++) {
      this.addDependency(toAdd[i]!);
    }

    // Update dependencies array
    current.length = 0;
    newDeps.forEach((dep) => {
      current.push(dep as Dependency);
    });
  }

  /**
   * Adds a single dependency with circular reference detection
   * @param dep Dependency to add
   * @throws ComputedError if subscription fails
   */
  private addDependency(dep: Dependency): void {
    debug.checkCircular(dep, this.computedObject);

    try {
      const unsubscribe = dep.subscribe(this.markDirty);
      this.dependencyManager.addDependency(dep, unsubscribe);
    } catch (error) {
      throw wrapError(error, ComputedError, 'dependency subscription');
    }
  }

  /**
   * Gets current dependency count
   * @returns Number of active dependencies
   */
  getDependencyCount(): number {
    return this.dependencyManager.count;
  }

  /**
   * Warns if dependency count exceeds threshold
   */
  checkDependencyLimit(): void {
    const count = this.getDependencyCount();
    debug.warn(count > debug.maxDependencies, ERROR_MESSAGES.LARGE_DEPENDENCY_GRAPH(count));
  }
}

/**
 * Creates a temporary dependency tracker for a single computation
 * @returns Tracking function with addDependency method
 */
export function createDependencyTracker(
  markDirty: () => void
): (() => void) & { addDependency: (dep: unknown) => void } {
  const newDependencies = new Set<unknown>();

  return Object.assign(() => markDirty(), {
    addDependency: (dep: unknown) => newDependencies.add(dep),
    getDependencies: () => newDependencies,
  });
}
