/**
 * @fileoverview Effect module for managing reactive side effects.
 *
 * This module provides a mechanism for creating and managing side effects
 * that automatically re-execute when their dependencies change. Effects
 * support cleanup functions, async operations, and infinite loop detection.
 */

import { EFFECT_STATE_FLAGS, SCHEDULER_CONFIG, SMI_MAX } from '../../constants';
import { nextEpoch } from '../../epoch';
import { EffectError, isPromise, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { depArrayPool, EMPTY_DEPS } from '../../pool';
import { scheduler } from '../../scheduler';
import { type DependencyTracker, trackingContext } from '../../tracking';
import type { Dependency, EffectFunction, EffectObject, EffectOptions } from '../../types';
import { debug, generateId } from '../../utils/debug';

/**
 * Internal implementation of the EffectObject interface.
 *
 * @remarks
 * This class manages reactive side effects with automatic dependency tracking,
 * cleanup handling, and infinite loop detection. It implements both EffectObject
 * for public API and DependencyTracker for integration with the tracking system.
 *
 * Key features:
 * - Automatic dependency tracking during execution
 * - Support for synchronous and scheduled (batched) execution
 * - Cleanup function support for resource management
 * - Infinite loop detection with configurable threshold
 * - Optional modification tracking for debugging
 *
 * @implements {EffectObject}
 * @implements {DependencyTracker}
 */
class EffectImpl implements EffectObject, DependencyTracker {
  // === Smi Fields (Fixed Order for V8 Hidden Class) ===
  private readonly _id: number;
  private _flags: number;
  // Effect is not a dependency, so it doesn't need _lastSeenEpoch for itself.
  // But we use _epoch during execution to track collected dependencies.
  private _currentEpoch: number;

  private readonly _fn: EffectFunction;
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _trackModifications: boolean;

  private _cleanup: (() => void) | null;

  // Optimized Dependency Management
  private _dependencies: Dependency[];
  private readonly _subscriptions: WeakMap<Dependency, () => void>;

  // Execution State
  private _nextDeps: Dependency[] | null;
  private readonly _modifiedDeps: Set<unknown>;
  private readonly _history: Float64Array;
  private _historyIdx: number;
  private _historyCount: number;
  private _executionCount: number;
  private readonly _historyCapacity: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    this._id = generateId() & SMI_MAX;
    this._flags = 0;
    this._currentEpoch = -1;

    this._fn = fn;
    this._sync = options.sync ?? false;
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._trackModifications = options.trackModifications ?? false;

    this._cleanup = null;

    // Dependencies
    this._dependencies = EMPTY_DEPS as Dependency[];
    this._subscriptions = new WeakMap();
    this._nextDeps = null;

    this._modifiedDeps = new Set();

    this._historyCapacity = this._maxExecutions + 5;
    this._history = new Float64Array(this._historyCapacity);
    this._historyIdx = 0;
    this._historyCount = 0;
    this._executionCount = 0;

    debug.attachDebugInfo(this, 'effect', this._id);
  }

  /**
   * Manually triggers the effect to run.
   *
   * @throws {EffectError} If the effect has been disposed
   *
   * @remarks
   * This method is typically used when you need to force an effect to
   * re-execute outside of its normal dependency-triggered execution cycle.
   *
   * @example
   * ```typescript
   * const fx = effect(() => console.log(counter.value));
   * // Later, force re-execution:
   * fx.run();
   * ```
   */
  public run = (): void => {
    if (this.isDisposed) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
    }
    this.execute();
  };

  /**
   * Disposes of the effect, cleaning up all resources and subscriptions.
   *
   * @remarks
   * After disposal:
   * - The cleanup function is called (if any)
   * - All dependency subscriptions are removed
   * - Modification tracking descriptors are restored to their original state
   * - The effect will no longer execute
   *
   * This method is idempotent - calling it multiple times has no additional effect.
   *
   * @example
   * ```typescript
   * const fx = effect(() => console.log(counter.value));
   * // Later, when the effect is no longer needed:
   * fx.dispose();
   * ```
   */
  public dispose = (): void => {
    if (this.isDisposed) return;

    this._setDisposed();
    this._safeCleanup();

    // Unsubscribe all
    if (this._dependencies !== EMPTY_DEPS) {
      for (const dep of this._dependencies) {
        const unsub = this._subscriptions.get(dep);
        if (unsub) unsub();
        this._subscriptions.delete(dep);
      }
      depArrayPool.release(this._dependencies);
      this._dependencies = EMPTY_DEPS as Dependency[];
    }
  };

  /**
   * Adds a dependency to this effect's tracking list.
   *
   * @param dep - The dependency to track (must implement Dependency interface)
   *
   * @throws {EffectError} If subscription to the dependency fails
   *
   * @remarks
   * This method is called automatically by the tracking context when
   * a reactive value is accessed during effect execution. It sets up
   * a subscription so the effect re-executes when the dependency changes.
   *
   * If modification tracking is enabled and the dependency is an atom,
   * additional tracking is set up to detect read-after-write patterns.
   *
   * @internal
   */
  public addDependency = (dep: unknown): void => {
    // Stage 1: Collect into buffer (nextDeps)
    if (this.isExecuting && this._nextDeps) {
      const d = dep as Dependency;
      const epoch = this._currentEpoch;

      // O(1) deduplication via Epoch
      if (d._lastSeenEpoch === epoch) return;
      d._lastSeenEpoch = epoch;

      this._nextDeps.push(d);

      // Eagerly subscribe to catch synchronous updates
      if (!this._subscriptions.has(d)) {
        this._subscribeTo(d);
      }
    }
  };

  /**
   * Executes the effect function, tracking dependencies and managing cleanup.
   *
   * @remarks
   * This method performs the following steps:
   * 1. Checks if the effect is disposed or already executing (guards against re-entrancy)
   * 2. Records the execution timestamp for infinite loop detection
   * 3. Runs any existing cleanup function
   * 4. Clears previous dependency subscriptions
   * 5. Executes the effect function within a tracking context
   * 6. Handles both sync and async cleanup functions
   *
   * If the effect function returns a Promise, the cleanup function is extracted
   * from the resolved value. Errors during execution are caught and logged.
   *
   * @example
   * ```typescript
   * const fx = effect(() => {
   *   console.log(counter.value);
   *   return () => console.log('cleanup');
   * });
   * fx.execute(); // Manually trigger execution
   * ```
   */
  public execute = (): void => {
    if (this.isDisposed || this.isExecuting) return;

    const now = Date.now();
    this._recordExecution(now);

    this._setExecuting(true);
    this._safeCleanup();
    this._modifiedDeps.clear();

    // ⚡ HFT Optimization: Pooled Array + Epoch
    const prevDeps = this._dependencies;
    const nextDeps = depArrayPool.acquire();
    const epoch = nextEpoch();

    this._nextDeps = nextDeps;
    this._currentEpoch = epoch;

    let committed = false;

    try {
      const result = trackingContext.run(this, this._fn);

      // Commit dependencies
      this._syncDependencies(prevDeps, nextDeps, epoch);
      this._dependencies = nextDeps;
      committed = true;

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
      // Commit partial dependencies for recovery (eager subscription already happened)
      this._syncDependencies(prevDeps, nextDeps, epoch);
      this._dependencies = nextDeps;
      committed = true;

      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
      this._cleanup = null;
    } finally {
      this._setExecuting(false);
      this._nextDeps = null;

      if (committed) {
        if (prevDeps !== EMPTY_DEPS) {
          depArrayPool.release(prevDeps);
        }
      } else {
        depArrayPool.release(nextDeps);
      }
    }
  };

  /**
   * Synchronizes subscriptions by unsubscribing from removed dependencies.
   * Uses epoch-based O(N) diff to identify stale dependencies.
   *
   * @param prevDeps - Previous dependency array
   * @param epoch - Current execution epoch for staleness detection
   */
  private _syncDependencies(prevDeps: Dependency[], epoch: number): void {
    if (prevDeps !== EMPTY_DEPS) {
      for (let i = 0; i < prevDeps.length; i++) {
        const dep = prevDeps[i];
        if (!dep) continue;

        if (dep._lastSeenEpoch !== epoch) {
          const unsub = this._subscriptions.get(dep);
          if (unsub) {
            unsub();
            this._subscriptions.delete(dep);
          }
        }
      }
    }
  }

  private _subscribeTo(dep: Dependency): void {
    try {
      const unsubscribe = dep.subscribe(() => {
        if (this._trackModifications && this.isExecuting) {
          this._modifiedDeps.add(dep);
        }

        if (this._sync) {
          this.execute();
        } else {
          scheduler.schedule(this.execute);
        }
      });
      this._subscriptions.set(dep, unsubscribe);
    } catch (error) {
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
    }
  }

  /**
   * Indicates whether this effect has been disposed.
   *
   * @returns `true` if the effect has been disposed, `false` otherwise
   *
   * @remarks
   * A disposed effect will not execute and cannot be reactivated.
   * Use this property to check if the effect is still active before
   * performing operations that depend on it.
   *
   * @example
   * ```typescript
   * const fx = effect(() => console.log(counter.value));
   * console.log(fx.isDisposed); // false
   * fx.dispose();
   * console.log(fx.isDisposed); // true
   * ```
   */
  get isDisposed(): boolean {
    return (this._flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }

  /**
   * Returns the total number of times this effect has been executed.
   *
   * @returns The cumulative execution count since the effect was created
   *
   * @remarks
   * This counter is useful for debugging, testing, and monitoring
   * effect behavior. It increments on every execution, regardless
   * of whether the execution succeeds or fails.
   *
   * @example
   * ```typescript
   * const fx = effect(() => console.log(counter.value));
   * console.log(fx.executionCount); // 1 (initial execution)
   * counter.value = 10;
   * console.log(fx.executionCount); // 2
   * ```
   */
  get executionCount(): number {
    return this._executionCount;
  }

  /**
   * Indicates whether this effect is currently executing.
   *
   * @returns `true` if the effect is mid-execution, `false` otherwise
   *
   * @remarks
   * This property is used internally to prevent re-entrant execution
   * (an effect triggering itself during its own execution). It can
   * also be useful for debugging to understand the effect's state.
   *
   * @example
   * ```typescript
   * const fx = effect(() => {
   *   console.log('executing:', fx.isExecuting); // true
   * });
   * console.log(fx.isExecuting); // false (after execution completes)
   * ```
   */
  get isExecuting(): boolean {
    return (this._flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  /**
   * Sets the disposed flag on this effect.
   *
   * @remarks
   * This is a low-level method that only sets the bit flag.
   * Use the public `dispose()` method for proper cleanup.
   *
   * @internal
   */
  private _setDisposed(): void {
    this._flags |= EFFECT_STATE_FLAGS.DISPOSED;
  }

  /**
   * Sets or clears the executing flag on this effect.
   *
   * @param value - `true` to mark as executing, `false` to clear
   *
   * @remarks
   * Uses bitwise operations for efficient flag manipulation.
   * This flag prevents re-entrant execution of the effect.
   *
   * @internal
   */
  private _setExecuting(value: boolean): void {
    if (value) this._flags |= EFFECT_STATE_FLAGS.EXECUTING;
    else this._flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
  }

  /**
   * Safely executes the cleanup function if one exists.
   *
   * @remarks
   * This method:
   * - Checks if a cleanup function exists and is callable
   * - Wraps the cleanup call in a try-catch to prevent cleanup errors
   *   from breaking the effect lifecycle
   * - Logs any cleanup errors to the console
   * - Clears the cleanup reference after execution
   *
   * @internal
   */
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
   * Records an execution timestamp and checks for infinite loop conditions.
   *
   * @param now - The current timestamp in milliseconds (from `Date.now()`)
   *
   * @remarks
   * This method implements a circular buffer to track recent execution
   * timestamps. If the number of executions within the last second exceeds
   * `_maxExecutions`, the effect is disposed and an error is thrown (in debug mode)
   * or logged (in production mode).
   *
   * The circular buffer approach provides O(1) insertion and efficient
   * memory usage for tracking execution history.
   *
   * @throws {EffectError} In debug mode, throws when infinite loop is detected
   *
   * @internal
   */
  private _recordExecution(now: number): void {
    if (this._maxExecutions <= 0) return;

    const oneSecondAgo = now - 1000;

    this._history[this._historyIdx] = now;
    this._historyIdx = (this._historyIdx + 1) % this._historyCapacity;
    if (this._historyCount < this._historyCapacity) {
      this._historyCount++;
    }
    this._executionCount++;

    let count = 0;
    let idx = (this._historyIdx - 1 + this._historyCapacity) % this._historyCapacity;

    for (let i = 0; i < this._historyCount; i++) {
      if (this._history[idx]! < oneSecondAgo) {
        break;
      }
      count++;
      idx = (idx - 1 + this._historyCapacity) % this._historyCapacity;
    }

    if (count > this._maxExecutions) {
      const message = `Effect executed ${count} times within 1 second. Infinite loop suspected`;
      const error = new EffectError(message);

      this.dispose();
      console.error(error);

      if (debug.enabled) {
        throw error;
      }
    }
  }

  /**
   * Checks for and warns about potential infinite loop patterns.
   *
   * @remarks
   * When modification tracking is enabled and debug mode is active,
   * this method checks if any dependencies were both read and modified
   * during the effect execution. Such patterns often lead to infinite loops.
   *
   * Warnings are only emitted in debug mode to avoid performance overhead
   * in production.
   *
   * @internal
   */
  private _checkLoopWarnings(): void {
    if (this._trackModifications && debug.enabled) {
      const dependencies = this._dependencies;
      for (let i = 0; i < dependencies.length; i++) {
        const dep = dependencies[i];
        if (dep && this._modifiedDeps.has(dep)) {
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
 * Creates a reactive effect that automatically re-executes when its dependencies change.
 *
 * @param fn - The effect function to execute. May return a cleanup function
 *             or a Promise that resolves to a cleanup function.
 * @param options - Configuration options for the effect
 * @param options.sync - If true, re-executes synchronously on dependency changes.
 *                       Defaults to false (scheduled/batched execution).
 * @param options.maxExecutionsPerSecond - Maximum executions per second before
 *                                          infinite loop detection triggers.
 *                                          Defaults to `SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND`.
 * @param options.trackModifications - If true, tracks and warns about dependencies
 *                                     that are both read and modified. Defaults to false.
 *
 * @returns An {@link EffectObject} with `run()`, `dispose()`, and state properties
 *
 * @throws {EffectError} If `fn` is not a function
 *
 * @remarks
 * Effects are the primary way to perform side effects in response to reactive
 * state changes. They automatically track which reactive values (atoms, computed)
 * are accessed during execution and re-run when those values change.
 *
 * The effect function may return a cleanup function that will be called before
 * the next execution or when the effect is disposed. This is useful for
 * cleaning up subscriptions, timers, or other resources.
 *
 * @example
 * Basic usage:
 * ```typescript
 * const counter = atom(0);
 *
 * const fx = effect(() => {
 *   console.log('Counter:', counter.value);
 * });
 * // Logs: "Counter: 0"
 *
 * counter.value = 1;
 * // Logs: "Counter: 1"
 *
 * fx.dispose(); // Stop the effect
 * ```
 *
 * @example
 * With cleanup function:
 * ```typescript
 * const fx = effect(() => {
 *   const timer = setInterval(() => console.log('tick'), 1000);
 *   return () => clearInterval(timer); // Cleanup
 * });
 * ```
 *
 * @example
 * Synchronous execution:
 * ```typescript
 * const fx = effect(
 *   () => console.log(counter.value),
 *   { sync: true }
 * );
 * ```
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  const effectInstance = new EffectImpl(fn, options);

  effectInstance.execute();

  return effectInstance;
}
