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
 * Type guard for atoms (defined here to avoid circular dependency with helpers)
 */
function isAtom(obj: unknown): obj is ReadonlyAtom {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'value' in obj &&
    'subscribe' in obj &&
    typeof obj.subscribe === 'function'
  );
}

/**
 * Effect Implementation Class
 * 
 * Optimized for V8 performance:
 * - Stable hidden class (all properties initialized in constructor)
 * - Ring buffer for execution history (Float64Array)
 * - Bitwise flags for state
 * - Bound methods for safe callback usage
 */
class EffectImpl implements EffectObject, DependencyTracker {
  // 1. Stable Property Layout (initialized in constructor)
  private readonly _fn: EffectFunction;
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _trackModifications: boolean;
  private readonly _id: number;

  // Mutable State (grouped for locality)
  /** Bitwise flags for state (EXECUTING, DISPOSED) */
  private _flags: number;
  private _cleanup: (() => void) | null;
  
  // Dependency Tracking
  private readonly _depManager: DependencyManager;
  private readonly _modifiedDeps: Set<unknown>;
  private readonly _originalDescriptors: WeakMap<Dependency, PropertyDescriptor>;
  private readonly _trackedDeps: Set<Dependency>;

  // Ring Buffer for History (Float64Array to avoid object allocation)
  private readonly _history: Float64Array;
  private _historyIdx: number;
  private _historyCount: number; // Number of valid entries in history
  private _executionCount: number;
  private readonly _historyCapacity: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    // Configuration
    this._fn = fn;
    this._sync = options.sync ?? false;
    this._maxExecutions = options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._trackModifications = options.trackModifications ?? false;
    this._id = generateId();

    // State
    this._flags = 0;
    this._cleanup = null;

    // Dependency Management
    this._depManager = new DependencyManager();
    this._modifiedDeps = new Set();
    this._originalDescriptors = new WeakMap();
    this._trackedDeps = new Set();

    // Ring Buffer Initialization
    // Capacity = maxExecutions + small buffer to detect overflow
    this._historyCapacity = this._maxExecutions + 5;
    this._history = new Float64Array(this._historyCapacity);
    this._historyIdx = 0;
    this._historyCount = 0;
    this._executionCount = 0;

    // Debug attachment
    debug.attachDebugInfo(this, 'effect', this._id);
  }

  // --- Public API (Bound Methods) ---

  /**
   * Manually runs the effect
   * @throws {EffectError} If effect has been disposed
   */
  public run = (): void => {
    if (this.isDisposed) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
    }
    this.execute();
  };

  /**
   * Disposes the effect and cleans up all resources
   * Restores any modified property descriptors
   */
  public dispose = (): void => {
    if (this.isDisposed) return;

    this._setDisposed();
    this._safeCleanup();
    this._depManager.unsubscribeAll();

    // Restore descriptors modified by trackModifications
    if (this._trackedDeps.size > 0) {
      this._trackedDeps.forEach((dep) => {
        const descriptor = this._originalDescriptors.get(dep);
        if (descriptor) {
          try {
            Object.defineProperty(dep, 'value', descriptor);
          } catch (_error) {
            debug.warn(true, 'Failed to restore original descriptor');
          }
        }
      });
      this._trackedDeps.clear();
    }
  };

  /**
   * Adds a dependency to track
   * Called by tracking context when dependencies are accessed
   */
  public addDependency = (dep: unknown): void => {
    try {
      const unsubscribe = (dep as Dependency).subscribe(() => {
        if (this._sync) {
          this.execute();
        } else {
          scheduler.schedule(this.execute);
        }
      });
      this._depManager.addDependency(dep as Dependency, unsubscribe);

      if (this._trackModifications && isAtom(dep)) {
        this._trackModificationsForDep(dep);
      }
    } catch (error) {
      throw wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED);
    }
  };

  /**
   * Executes the effect function with dependency tracking
   * Implements infinite loop detection and cleanup handling
   */
  public execute = (): void => {
    if (this.isDisposed || this.isExecuting) return;

    const now = Date.now();
    this._recordExecution(now);

    this._setExecuting(true);
    this._safeCleanup();
    this._depManager.unsubscribeAll();
    this._modifiedDeps.clear();

    try {
      // Use trackingContext.run with 'this' as the listener
      const result = trackingContext.run(this, this._fn);

      this._checkLoopWarnings();

      if (isPromise(result)) {
        result
          .then((asyncCleanup) => {
            if (!this.isDisposed && typeof asyncCleanup === 'function') {
              this._cleanup = asyncCleanup;
            }
          })
          .catch((error) => {
            console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
          });
      } else {
        this._cleanup = typeof result === 'function' ? result : null;
      }
    } catch (error) {
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
      this._cleanup = null;
    } finally {
      this._setExecuting(false);
    }
  };

  // --- Getters ---

  get isDisposed(): boolean {
    return (this._flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }

  get executionCount(): number {
    return this._executionCount;
  }

  get isExecuting(): boolean {
    return (this._flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  // --- Private Helpers ---

  private _setDisposed(): void {
    this._flags |= EFFECT_STATE_FLAGS.DISPOSED;
  }

  private _setExecuting(value: boolean): void {
    if (value) this._flags |= EFFECT_STATE_FLAGS.EXECUTING;
    else this._flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
  }

  private _safeCleanup(): void {
    if (this._cleanup && typeof this._cleanup === 'function') {
      try {
        this._cleanup();
      } catch (error) {
        console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED));
      }
      this._cleanup = null;
    }
  }

  /**
   * Records execution time and checks for infinite loops using Ring Buffer
   */
  private _recordExecution(now: number): void {
    if (this._maxExecutions <= 0) return;

    const oneSecondAgo = now - 1000;
    
    // Add new timestamp
    this._history[this._historyIdx] = now;
    this._historyIdx = (this._historyIdx + 1) % this._historyCapacity;
    if (this._historyCount < this._historyCapacity) {
      this._historyCount++;
    }
    this._executionCount++;

    // Check execution count within 1 second
    // Iterate backwards from current index
    let count = 0;
    let idx = (this._historyIdx - 1 + this._historyCapacity) % this._historyCapacity;
    
    for (let i = 0; i < this._historyCount; i++) {
        if (this._history[idx]! < oneSecondAgo) {
            // Found a timestamp older than 1s, we can stop counting for "recent"
            // And technically we could "clean up" the count, but for ring buffer we just overwrite.
            // But to match 'executionCount' behavior of mostly recent:
            // We can lazily update _historyCount? No, _historyCount tracks valid entries in buffer.
            
            // To strictly match "infinite loop suspected" logic:
            // We need count of events > maxExecutionsPerSecond within 1s.
            break;
        }
        count++;
        idx = (idx - 1 + this._historyCapacity) % this._historyCapacity;
    }

    if (count > this._maxExecutions) {
      const message = `Effect executed ${count} times within 1 second. Infinite loop suspected`;
      const error = new EffectError(message);

      // Dispose effect to prevent further execution
      this.dispose();
      console.error(error);

      if (debug.enabled) {
        throw error;
      }
    }
  }

  private _trackModificationsForDep(dep: any): void {
    const proto = Object.getPrototypeOf(dep);
    const originalDescriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (originalDescriptor?.set && !this._originalDescriptors.has(dep)) {
      this._originalDescriptors.set(dep, originalDescriptor);
      this._trackedDeps.add(dep);

      // We need to capture 'this' carefully. 
      // Since this is called from addDependency which is a bound method, 'this' refers to the instance.
      const self = this;

      Object.defineProperty(dep, 'value', {
        set(newValue: unknown) {
          self._modifiedDeps.add(dep);
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

  private _checkLoopWarnings(): void {
    if (this._trackModifications && debug.enabled) {
      const dependencies = this._depManager.getDependencies();
      for (let i = 0; i < dependencies.length; i++) {
        const dep = dependencies[i]!;
        if (this._modifiedDeps.has(dep)) {
          debug.warn(
            true,
            `Effect is reading a dependency (${
              debug.getDebugName(dep) || 'unknown'
            }) that it just modified. Infinite loop may occur`
          );
        }
      }
    }
  }
}

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
  
  const effectInstance = new EffectImpl(fn, options);
  
  // Initial run
  effectInstance.execute();
  
  return effectInstance;
}