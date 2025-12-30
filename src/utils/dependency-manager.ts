/**
 * @fileoverview Common dependency management utility following DRY principle
 * @description WeakRef-based automatic GC with memory locality optimization
 */

/**
 * Interface for objects that can be tracked as dependencies
 *
 * Dependencies must provide a subscribe method for change notifications
 * and optionally provide peek() for reading without tracking.
 */
export interface Dependency {
  /** Subscribe to changes in this dependency */
  subscribe(listener: (() => void) | { execute: () => void }): () => void;
  /** Read value without tracking as dependency */
  peek?(): unknown;
  /** Current value (for atoms) */
  value?: unknown;
}

/**
 * Manages dependencies using WeakRef for automatic garbage collection
 *
 * This class solves the memory leak problem in reactive systems by:
 * 1. **WeakRef**: Allows GC to clean up unused dependencies automatically
 * 2. **Periodic cleanup**: Removes dead WeakRefs to maintain array efficiency
 * 3. **WeakMap**: Stores unsubscribe functions with automatic GC
 *
 * ## Memory Optimizations
 * - Array of WeakRefs allows iteration while enabling GC
 * - WeakMap provides O(1) lookup without preventing GC
 * - Automatic cleanup triggered at threshold to balance memory vs CPU
 *
 * ## Performance Characteristics
 * - `addDependency()`: O(1) amortized (O(n) when cleanup triggers)
 * - `getDependencies()`: O(n) - filters live dependencies
 * - `cleanup()`: O(n) - removes dead WeakRefs
 * - `hasDependency()`: O(1) - WeakMap lookup
 *
 * @example
 * ```ts
 * const manager = new DependencyManager();
 * const unsub = atom.subscribe(() => {});
 * manager.addDependency(atom, unsub);
 * // Later...
 * manager.unsubscribeAll(); // Cleans up
 * ```
 */
export class DependencyManager {
  /** Maps live dependencies to their unsubscribe functions (auto-GC'd) */
  private depMap = new WeakMap<Dependency, () => void>();

  /** Array of WeakRefs to dependencies (allows iteration + GC) */
  private depRefs: WeakRef<Dependency>[] = [];

  /** Threshold for triggering automatic cleanup (default: 100) */
  private cleanupThreshold = 100;

  /** Counter for additions since last cleanup */
  private addCount = 0;

  /**
   * Adds a dependency with its unsubscribe function
   *
   * Automatically triggers cleanup when threshold is reached to
   * remove dead WeakRefs and maintain performance.
   *
   * @param dep - Dependency object to track
   * @param unsubscribe - Function to call when unsubscribing
   */
  addDependency(dep: Dependency, unsubscribe: () => void): void {
    if (this.depMap.has(dep)) {
      // Already tracking this dependency. Unsubscribe the new one immediately
      // to prevents duplicates and memory leaks.
      unsubscribe();
      return;
    }

    this.depMap.set(dep, unsubscribe);
    this.depRefs.push(new WeakRef(dep));

    // Periodic automatic cleanup (reduces GC pressure)
    if (++this.addCount >= this.cleanupThreshold) {
      this.cleanup();
      this.addCount = 0;
    }
  }

  /**
   * Removes a specific dependency and calls its unsubscribe function
   *
   * @param dep - Dependency object to remove
   * @returns True if dependency was found and removed
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
      // Note: WeakRef remains in depRefs but will be cleaned up automatically
      return true;
    }
    return false;
  }

  /**
   * Checks if a specific dependency is registered
   *
   * @param dep - Dependency object to check
   * @returns True if dependency is currently registered
   */
  hasDependency(dep: Dependency): boolean {
    return this.depMap.has(dep);
  }

  /**
   * Unsubscribes from all dependencies
   *
   * Iterates through live dependencies only (skipping dead WeakRefs)
   * and calls their unsubscribe functions. Errors are caught and logged
   * to prevent one bad unsubscribe from breaking the entire cleanup.
   */
  unsubscribeAll(): void {
    // Iterate only live dependencies (skip dead WeakRefs)
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
        }
      }
    }
    this.depRefs.length = 0;
    this.addCount = 0;
  }

  /**
   * Removes dead WeakRefs to improve memory efficiency
   *
   * Filters out WeakRefs that no longer reference live objects.
   * This is called automatically at threshold, but can be called
   * manually for explicit memory optimization.
   *
   * **When to call manually:**
   * - After bulk dependency additions
   * - Before dispose() for thorough cleanup
   * - During idle periods for memory optimization
   */
  cleanup(): void {
    // Keep only live WeakRefs (O(n) filtering)
    this.depRefs = this.depRefs.filter((ref) => ref.deref() !== undefined);
  }

  /**
   * Returns count of live dependencies
   *
   * **Note:** Triggers cleanup for accurate count.
   * Only counts dependencies that haven't been garbage collected.
   *
   * @returns Number of currently live dependencies
   */
  get count(): number {
    // Lazy cleanup: auto-cleanup when accurate count needed
    this.cleanup();
    return this.depRefs.length;
  }

  /**
   * Returns array of live dependencies
   *
   * Filters out dead WeakRefs and returns only dependencies that
   * are still in memory. Used internally by computed/effect for
   * dependency tracking.
   *
   * @returns Array of live dependency objects
   */
  getDependencies(): Dependency[] {
    // Filter live dependencies only (WeakRef.deref())
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
   * Provides access to internal WeakMap (for advanced use cases)
   *
   * @returns WeakMap containing dependency to unsubscribe mappings
   * @internal
   */
  getDepMap(): WeakMap<Dependency, () => void> {
    return this.depMap;
  }

  /**
   * Sets cleanup threshold for memory tuning
   *
   * Lower values mean more frequent cleanup (less memory, more CPU).
   * Higher values mean less frequent cleanup (more memory, less CPU).
   *
   * @param threshold - New threshold value (minimum: 1, default: 100)
   */
  setCleanupThreshold(threshold: number): void {
    this.cleanupThreshold = Math.max(1, threshold);
  }
}
