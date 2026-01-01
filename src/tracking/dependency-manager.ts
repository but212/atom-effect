import type { Dependency } from '../types';

/**
 * Manages reactive dependencies with automatic cleanup and memory-efficient tracking.
 *
 * This class provides a centralized way to track dependencies between reactive
 * primitives (atoms, computed values) and their subscribers. It uses WeakRef
 * and WeakMap for memory-efficient storage that allows garbage collection
 * of unused dependencies.
 *
 * @remarks
 * - Uses WeakMap for O(1) lookup and automatic GC of unreferenced dependencies
 * - Uses WeakRef array for iteration while allowing GC
 * - Periodic cleanup removes stale WeakRefs to prevent memory leaks
 * - Thread-safe for single-threaded JavaScript execution
 *
 * @example
 * ```typescript
 * const manager = new DependencyManager();
 *
 * // Add a dependency with its unsubscribe callback
 * const unsubscribe = atom.subscribe(() => recompute());
 * manager.addDependency(atom, unsubscribe);
 *
 * // Check if dependency exists
 * if (manager.hasDependency(atom)) {
 *   console.log('Dependency tracked');
 * }
 *
 * // Remove specific dependency
 * manager.removeDependency(atom);
 *
 * // Clean up all dependencies
 * manager.unsubscribeAll();
 * ```
 */
export class DependencyManager {
  /**
   * WeakMap storing dependency -> unsubscribe function mappings.
   * Allows O(1) lookup and automatic garbage collection.
   */
  private depMap = new WeakMap<Dependency, () => void>();

  /**
   * Array of WeakRefs for iteration over live dependencies.
   * WeakRefs allow the referenced objects to be garbage collected.
   */
  private depRefs: WeakRef<Dependency>[] = [];

  /**
   * Number of additions before triggering automatic cleanup.
   * @defaultValue 100
   */
  private cleanupThreshold = 100;

  /**
   * Counter tracking additions since last cleanup.
   */
  private addCount = 0;

  /**
   * Adds a dependency with its associated unsubscribe callback.
   *
   * If the dependency already exists, the new unsubscribe callback is
   * immediately called to prevent duplicate subscriptions.
   *
   * @param dep - The dependency to track (atom, computed, etc.)
   * @param unsubscribe - Callback to invoke when removing the dependency
   *
   * @remarks
   * - Duplicate dependencies are rejected with immediate unsubscribe
   * - Automatic cleanup is triggered every `cleanupThreshold` additions
   * - Time complexity: O(1) for add, O(n) when cleanup triggers
   *
   * @example
   * ```typescript
   * const unsubscribe = atom.subscribe(() => markDirty());
   * manager.addDependency(atom, unsubscribe);
   * ```
   */
  addDependency(dep: Dependency, unsubscribe: () => void): void {
    if (this.depMap.has(dep)) {
      unsubscribe();
      return;
    }

    this.depMap.set(dep, unsubscribe);
    this.depRefs.push(new WeakRef(dep));

    if (++this.addCount >= this.cleanupThreshold) {
      this.cleanup();
      this.addCount = 0;
    }
  }

  /**
   * Removes a dependency and calls its unsubscribe callback.
   *
   * @param dep - The dependency to remove
   * @returns `true` if the dependency was found and removed, `false` otherwise
   *
   * @remarks
   * - Unsubscribe errors are caught and logged to prevent cascading failures
   * - The WeakRef entry is not immediately removed (cleaned up lazily)
   * - Time complexity: O(1)
   *
   * @example
   * ```typescript
   * const wasRemoved = manager.removeDependency(atom);
   * if (wasRemoved) {
   *   console.log('Dependency successfully removed');
   * }
   * ```
   */
  removeDependency(dep: Dependency): boolean {
    const unsubscribe = this.depMap.get(dep);
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn('[DependencyManager] Error during unsubscribe:', error);
      }
      this.depMap.delete(dep);
      return true;
    }
    return false;
  }

  /**
   * Checks if a dependency is currently being tracked.
   *
   * @param dep - The dependency to check
   * @returns `true` if the dependency exists in the manager
   *
   * @remarks
   * Time complexity: O(1)
   *
   * @example
   * ```typescript
   * if (manager.hasDependency(atom)) {
   *   // Dependency is already tracked
   * }
   * ```
   */
  hasDependency(dep: Dependency): boolean {
    return this.depMap.has(dep);
  }

  /**
   * Removes all dependencies and calls their unsubscribe callbacks.
   *
   * This method iterates through all tracked dependencies, calls their
   * unsubscribe callbacks, and clears internal storage.
   *
   * @remarks
   * - Errors during unsubscribe are caught and logged individually
   * - Safe to call multiple times (idempotent after first call)
   * - Time complexity: O(n) where n is the number of dependencies
   *
   * @example
   * ```typescript
   * // Clean up when disposing a computed value
   * manager.unsubscribeAll();
   * ```
   */
  unsubscribeAll(): void {
    for (let i = 0; i < this.depRefs.length; i++) {
      const dep = this.depRefs[i]!.deref();
      if (dep) {
        const unsubscribe = this.depMap.get(dep);
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch (error) {
            console.warn('[DependencyManager] Error during unsubscribe:', error);
          }
          this.depMap.delete(dep);
        }
      }
    }
    this.depRefs.length = 0;
    this.addCount = 0;
  }

  /**
   * Removes stale WeakRefs from the internal array.
   *
   * WeakRefs whose targets have been garbage collected are filtered out
   * to prevent unbounded growth of the depRefs array.
   *
   * @remarks
   * - Called automatically every `cleanupThreshold` additions
   * - Can be called manually for immediate cleanup
   * - Time complexity: O(n) where n is the number of WeakRefs
   *
   * @example
   * ```typescript
   * // Force immediate cleanup
   * manager.cleanup();
   * ```
   */
  cleanup(): void {
    this.depRefs = this.depRefs.filter((ref) => ref.deref() !== undefined);
  }

  /**
   * Gets the current number of live dependencies.
   *
   * @returns The count of dependencies that haven't been garbage collected
   *
   * @remarks
   * - Triggers cleanup before counting for accurate results
   * - Time complexity: O(n) due to cleanup
   *
   * @example
   * ```typescript
   * console.log(`Tracking ${manager.count} dependencies`);
   * ```
   */
  get count(): number {
    this.cleanup();
    return this.depRefs.length;
  }

  /**
   * Gets an array of all live dependencies.
   *
   * @returns Array of dependencies that haven't been garbage collected
   *
   * @remarks
   * - Returns a new array (safe to modify)
   * - Does not trigger cleanup (may include some stale refs)
   * - Time complexity: O(n)
   *
   * @example
   * ```typescript
   * const deps = manager.getDependencies();
   * deps.forEach(dep => console.log(dep));
   * ```
   */
  getDependencies(): Dependency[] {
    const liveDeps: Dependency[] = [];
    for (let i = 0; i < this.depRefs.length; i++) {
      const dep = this.depRefs[i]!.deref();
      if (dep !== undefined) {
        liveDeps.push(dep);
      }
    }
    return liveDeps;
  }

  /**
   * Gets the internal WeakMap for advanced use cases.
   *
   * @returns The internal dependency -> unsubscribe WeakMap
   *
   * @remarks
   * - Returns the actual internal map (not a copy)
   * - Modifications will affect the manager's state
   * - Use with caution in production code
   *
   * @example
   * ```typescript
   * const map = manager.getDepMap();
   * const unsubscribe = map.get(someDependency);
   * ```
   */
  getDepMap(): WeakMap<Dependency, () => void> {
    return this.depMap;
  }

  /**
   * Sets the threshold for automatic cleanup triggering.
   *
   * @param threshold - Number of additions before cleanup (minimum 1)
   *
   * @remarks
   * - Lower values mean more frequent cleanup (less memory, more CPU)
   * - Higher values mean less frequent cleanup (more memory, less CPU)
   * - Default is 100, suitable for most use cases
   *
   * @example
   * ```typescript
   * // More aggressive cleanup for memory-constrained environments
   * manager.setCleanupThreshold(50);
   *
   * // Less frequent cleanup for performance-critical paths
   * manager.setCleanupThreshold(500);
   * ```
   */
  setCleanupThreshold(threshold: number): void {
    this.cleanupThreshold = Math.max(1, threshold);
  }
}
