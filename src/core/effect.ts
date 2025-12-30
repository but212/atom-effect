/**
 * @fileoverview effect: Side effect management with automatic dependency tracking
 * @description Executes side effects when reactive dependencies change
 */

import { EFFECT_STATE_FLAGS, SCHEDULER_CONFIG } from '../constants';
import { EffectError, isPromise, wrapError } from '../errors/errors';
import { ERROR_MESSAGES } from '../errors/messages';
import type {
  Dependency,
  EffectFunction,
  EffectObject,
  EffectOptions,
  ReadonlyAtom,
} from '../types';
import { debug, generateId } from '../utils/debug';
import { DependencyManager } from '../utils/dependency-manager';
import { scheduler } from '../utils/scheduler';
import { type DependencyTracker, trackingContext } from '../utils/tracking';

/**
 * Creates an effect that automatically runs when dependencies change
 *
 * Effects are for side effects (DOM updates, logging, API calls, etc.) that should
 * run in response to reactive state changes. They:
 * - Automatically track dependencies accessed during execution
 * - Re-run when any dependency changes
 * - Support cleanup functions (sync/async)
 * - Detect infinite loops (configurable threshold)
 * - Can track modifications to prevent read-after-write issues
 * - Use sliding window optimization for execution tracking
 *
 * @param fn - Effect function to execute (can return cleanup function or Promise)
 * @param options - Configuration options
 * @param options.sync - If true, run synchronously (default: false)
 * @param options.maxExecutionsPerSecond - Threshold for infinite loop detection (default: 100)
 * @param options.trackModifications - Track dependency modifications to warn about potential loops
 * @returns An effect object with dispose() and run() methods
 *
 * @example
 * ```ts
 * // Basic effect
 * const count = atom(0);
 * const dispose = effect(() => {
 *   console.log('Count changed:', count.value);
 * });
 * count.value = 1; // Logs: "Count changed: 1"
 * dispose.dispose(); // Stop the effect
 *
 * // Effect with cleanup
 * const userId = atom(1);
 * effect(() => {
 *   const controller = new AbortController();
 *   fetch(`/api/users/${userId.value}`, { signal: controller.signal })
 *     .then(res => res.json())
 *     .then(data => console.log(data));
 *
 *   // Cleanup function
 *   return () => controller.abort();
 * });
 *
 * // Async effect with cleanup
 * effect(async () => {
 *   const subscription = await subscribeToUpdates(userId.value);
 *   return () => subscription.unsubscribe();
 * });
 *
 * // Synchronous effect (runs immediately)
 * effect(() => {
 *   document.title = `Count: ${count.value}`;
 * }, { sync: true });
 *
 * // Track modifications to detect potential infinite loops
 * effect(() => {
 *   if (count.value < 10) {
 *     count.value++; // Warning: modifying dependency being tracked
 *   }
 * }, { trackModifications: true });
 * ```
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  let cleanup: (() => void) | null = null;
  let stateFlags = 0;
  /**
   * Sliding window optimization: uses index pointer instead of shift() O(n)
   * Tracks execution times for infinite loop detection
   */
  const executionTimes: number[] = [];
  let startIndex = 0; // Valid start index for sliding window

  /**
   * Bit flag helper functions (inline optimization)
   * Uses bitwise operations for efficient state checks
   */
  const isDisposed = (): boolean => (stateFlags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  const setDisposed = (): void => {
    stateFlags |= EFFECT_STATE_FLAGS.DISPOSED;
  };

  const isExecuting = (): boolean => (stateFlags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  const setExecuting = (value: boolean): void => {
    if (value) stateFlags |= EFFECT_STATE_FLAGS.EXECUTING;
    else stateFlags &= ~EFFECT_STATE_FLAGS.EXECUTING;
  };
  const {
    sync = false,
    maxExecutionsPerSecond = SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND,
    trackModifications = false,
  } = options;

  /** DependencyManager handles dependency tracking */
  const dependencyManager = new DependencyManager();
  /** Set of dependencies modified by this effect (WeakSet doesn't support clear()) */
  const modifiedDeps = new Set<unknown>();
  /** Stores original property descriptors for restoration (WeakMap for automatic GC) */
  const originalDescriptors = new WeakMap<Dependency, PropertyDescriptor>();
  /** Tracks dependencies with modified descriptors for restoration */
  const trackedDeps = new Set<Dependency>();
  const id = generateId();

  /**
   * Safely executes cleanup function with error handling
   */
  const safeCleanup = (): void => {
    if (cleanup && typeof cleanup === 'function') {
      try {
        cleanup();
      } catch (error) {
        console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED));
      }
      cleanup = null;
    }
  };

  /**
   * Type guard for atoms (defined here to avoid circular dependency with helpers)
   */
  const isAtom = (obj: unknown): obj is ReadonlyAtom => {
    return (
      obj !== null &&
      typeof obj === 'object' &&
      'value' in obj &&
      'subscribe' in obj &&
      typeof obj.subscribe === 'function'
    );
  };

  /**
   * Executes the effect function with dependency tracking
   * Implements infinite loop detection and cleanup handling
   */
  const execute = (): void => {
    if (isDisposed() || isExecuting()) return;

    const now = Date.now();

    // Sliding window optimization: move startIndex only (O(1))
    const oneSecondAgo = now - 1000;
    while (startIndex < executionTimes.length && executionTimes[startIndex]! < oneSecondAgo) {
      startIndex++;
    }

    // Memory optimization: Clean up old execution times
    if (startIndex > SCHEDULER_CONFIG.CLEANUP_THRESHOLD) {
      executionTimes.splice(0, startIndex);
      startIndex = 0;
    }

    // Record current execution time
    executionTimes.push(now);

    // Check execution count within 1 second (infinite loop detection)
    const recentExecutionCount = executionTimes.length - startIndex;
    if (recentExecutionCount > maxExecutionsPerSecond) {
      const message = `Effect executed ${recentExecutionCount} times within 1 second. Infinite loop suspected`;
      const error = new EffectError(message);

      // Dispose effect to prevent further execution (both dev and production)
      effectObject.dispose();
      console.error(error);

      if (debug.enabled) {
        throw error;
      }
      return;
    }

    setExecuting(true);

    safeCleanup();
    dependencyManager.unsubscribeAll();
    modifiedDeps.clear();

    try {
      const result = trackingContext.run(execute as DependencyTracker, fn);

      if (trackModifications && debug.enabled) {
        const dependencies = dependencyManager.getDependencies();
        for (let i = 0; i < dependencies.length; i++) {
          const dep = dependencies[i]!;
          if (modifiedDeps.has(dep)) {
            debug.warn(
              true,
              `Effect is reading a dependency (${
                debug.getDebugName(dep) || 'unknown'
              }) that it just modified. Infinite loop may occur`
            );
          }
        }
      }

      if (isPromise(result)) {
        result
          .then((asyncCleanup) => {
            if (!isDisposed() && typeof asyncCleanup === 'function') {
              cleanup = asyncCleanup;
            }
          })
          .catch((error) => {
            console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
          });
      } else {
        cleanup = typeof result === 'function' ? result : null;
      }
    } catch (error) {
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
      cleanup = null;
    } finally {
      setExecuting(false);
    }
  };

  /**
   * Adds a dependency to track
   * Called by tracking context when dependencies are accessed
   */
  (execute as { addDependency?: (dep: unknown) => void }).addDependency = (dep: unknown): void => {
    try {
      const unsubscribe = (dep as Dependency).subscribe(() => {
        if (sync) {
          execute();
        } else {
          scheduler.schedule(execute);
        }
      });
      dependencyManager.addDependency(dep as Dependency, unsubscribe);

      if (trackModifications && isAtom(dep)) {
        // Store original descriptor (for restoration and memory leak prevention)
        // Class getter/setter is defined on prototype, not instance
        const proto = Object.getPrototypeOf(dep);
        const originalDescriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (originalDescriptor?.set && !originalDescriptors.has(dep)) {
          originalDescriptors.set(dep, originalDescriptor);
          trackedDeps.add(dep); // Track for restoration

          Object.defineProperty(dep, 'value', {
            set(newValue: unknown) {
              modifiedDeps.add(dep);
              originalDescriptor.set?.call(dep, newValue);
            },
            get() {
              return dep.peek();
            },
            configurable: true,
            enumerable: true,
          });
        }
      }
    } catch (error) {
      throw wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED);
    }
  };

  execute();

  const effectObject: EffectObject = {
    /**
     * Disposes the effect and cleans up all resources
     * Restores any modified property descriptors
     */
    dispose(): void {
      if (isDisposed()) return;

      setDisposed();
      safeCleanup();
      dependencyManager.unsubscribeAll();

      // Restore descriptors modified by trackModifications
      trackedDeps.forEach((dep) => {
        const descriptor = originalDescriptors.get(dep);
        if (descriptor) {
          try {
            Object.defineProperty(dep, 'value', descriptor);
          } catch (_error) {
            debug.warn(true, 'Failed to restore original descriptor');
          }
        }
      });
      trackedDeps.clear();
    },

    /**
     * Manually runs the effect
     * @throws {EffectError} If effect has been disposed
     */
    run(): void {
      if (isDisposed()) {
        throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
      }
      execute();
    },

    get isDisposed(): boolean {
      return isDisposed();
    },

    get executionCount(): number {
      return executionTimes.length - startIndex;
    },
  };

  debug.attachDebugInfo(effectObject, 'effect', id);

  return effectObject;
}