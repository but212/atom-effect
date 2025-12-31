/**
 * @fileoverview Computed dependency management
 *
 * This module provides efficient dependency tracking and synchronization
 * for computed values using a delta sync algorithm that minimizes
 * subscription churn by only updating changed dependencies.
 *
 * @module computed-dependencies
 */

import { ComputedError, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import type { DependencyManager } from '../../tracking/dependency-manager';
import type { Dependency } from '../../types';
import { debug } from '../../utils/debug';

/**
 * Manages dependency synchronization for computed values.
 *
 * Uses a delta sync algorithm to efficiently update dependencies by:
 * 1. Fast path: O(1) check if no changes occurred
 * 2. Slow path: Only subscribe/unsubscribe changed dependencies
 *
 * @example
 * ```typescript
 * const syncManager = new DependencySyncManager(depManager, computed, markDirty);
 *
 * // During recomputation, collect new dependencies
 * const newDeps = new Set<unknown>();
 * // ... computation that populates newDeps ...
 *
 * // Efficiently sync dependencies
 * syncManager.update(newDeps);
 * ```
 *
 * @remarks
 * - WeakMap is used internally for automatic garbage collection
 * - Circular dependency detection is performed on each new subscription
 * - Thread-safe for single-threaded JavaScript execution
 */
export class DependencySyncManager {
  /**
   * Creates a new DependencySyncManager instance.
   *
   * @param dependencyManager - The underlying dependency manager for subscription handling
   * @param computedObject - Reference to the computed object for circular detection
   * @param markDirty - Callback invoked when any dependency changes
   *
   * @throws If dependencyManager is null or undefined
   */
  constructor(
    private dependencyManager: DependencyManager,
    private computedObject: unknown,
    private markDirty: () => void
  ) {}

  /**
   * Updates dependencies using the delta sync algorithm.
   *
   * This method compares the current dependencies with new ones and
   * performs minimal subscription changes for optimal performance.
   *
   * @param newDeps - Set of dependencies detected during the latest computation
   *
   * @remarks
   * Performance characteristics:
   * - Best case (no changes): O(n) where n is dependency count
   * - Worst case (all changed): O(n + m) where m is new dependency count
   *
   * @example
   * ```typescript
   * const newDeps = new Set([atomA, atomB, computedC]);
   * syncManager.update(newDeps);
   * ```
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
   * Checks if current dependencies are identical to new dependencies.
   *
   * This is the fast path optimization that avoids expensive subscription
   * operations when dependencies haven't changed.
   *
   * @param current - Array of current dependencies
   * @param newDeps - Set of new dependencies to compare
   * @returns True if dependencies are identical, false otherwise
   *
   * @remarks
   * Time complexity: O(n) where n is the number of current dependencies
   * Space complexity: O(1)
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
   * Performs delta synchronization between current and new dependencies.
   *
   * This method:
   * 1. Identifies dependencies to remove (in current but not in new)
   * 2. Identifies dependencies to add (in new but not in current)
   * 3. Unsubscribes from removed dependencies
   * 4. Subscribes to new dependencies
   * 5. Updates the internal dependency array
   *
   * @param current - Array of current dependencies (will be mutated)
   * @param newDeps - Set of new dependencies
   *
   * @remarks
   * Time complexity: O(n + m) where n is current count and m is new count
   * Space complexity: O(n + m) for temporary sets and arrays
   */
  private performDeltaSync(current: Dependency[], newDeps: Set<unknown>): void {
    const existingSet = new Set(current);
    const toRemove: Dependency[] = [];
    const toAdd: Dependency[] = [];

    // Find dependencies to remove (O(n))
    for (let i = 0; i < current.length; i++) {
      const dep = current[i]!;
      if (!newDeps.has(dep)) {
        toRemove.push(dep);
      }
    }

    // Find dependencies to add (O(m))
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

    // Update dependencies array in place
    current.length = 0;
    newDeps.forEach((dep) => {
      current.push(dep as Dependency);
    });
  }

  /**
   * Adds a single dependency with circular reference detection.
   *
   * @param dep - The dependency to add and subscribe to
   *
   * @throws If circular dependency is detected
   * @throws If subscription fails for any reason
   *
   * @remarks
   * This method performs circular reference detection before subscribing
   * to prevent infinite loops in the dependency graph.
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
   * Gets the current number of active dependencies.
   *
   * @returns The count of dependencies currently being tracked
   *
   * @remarks
   * This count may be less than the total subscriptions made if some
   * dependencies have been garbage collected (due to WeakRef usage).
   */
  getDependencyCount(): number {
    return this.dependencyManager.count;
  }

  /**
   * Checks if dependency count exceeds the configured threshold and warns.
   *
   * Large dependency graphs can indicate architectural issues and may
   * cause performance problems. This method helps identify such cases.
   *
   * @remarks
   * The warning threshold is configured via `debug.maxDependencies`.
   * Warnings are only emitted in development mode when debug is enabled.
   *
   * @see {@link debug.maxDependencies} for threshold configuration
   */
  checkDependencyLimit(): void {
    const count = this.getDependencyCount();
    debug.warn(count > debug.maxDependencies, ERROR_MESSAGES.LARGE_DEPENDENCY_GRAPH(count));
  }
}

/**
 * Temporary dependency tracker returned by createDependencyTracker.
 *
 * @remarks
 * This type combines a callable function with dependency tracking methods.
 */
export type DependencyTrackerFunction = (() => void) & {
  /**
   * Adds a dependency to be tracked during computation.
   * @param dep - The dependency to track
   */
  addDependency: (dep: unknown) => void;

  /**
   * Gets all collected dependencies.
   * @returns Set of all tracked dependencies
   */
  getDependencies: () => Set<unknown>;
};

/**
 * Creates a temporary dependency tracker for a single computation cycle.
 *
 * This factory function creates a tracker that collects dependencies
 * during a computation and can be used with the tracking context.
 *
 * @param markDirty - Callback to invoke when the computation needs rerun
 * @returns A tracking function with addDependency and getDependencies methods
 *
 * @example
 * ```typescript
 * const tracker = createDependencyTracker(() => markDirty());
 *
 * // Use in tracking context
 * const result = trackingContext.run(tracker, computeFn);
 *
 * // Get collected dependencies
 * const deps = tracker.getDependencies();
 * ```
 *
 * @remarks
 * The returned tracker is designed for single-use during one computation.
 * Create a new tracker for each recomputation cycle.
 */
export function createDependencyTracker(markDirty: () => void): DependencyTrackerFunction {
  const newDependencies = new Set<unknown>();

  return Object.assign(() => markDirty(), {
    addDependency: (dep: unknown) => newDependencies.add(dep),
    getDependencies: () => newDependencies,
  });
}
