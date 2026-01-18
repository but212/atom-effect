import { EFFECT_STATE_FLAGS, IS_DEV, SCHEDULER_CONFIG, TIME_CONSTANTS } from '@/constants';
import { ReactiveNode } from '@/core/base/reactive-node';
import { EffectError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import {
  flushEpoch,
  flushExecutionCount,
  incrementFlushExecutionCount,
  nextEpoch,
} from '@/internal/epoch';
import {
  depArrayPool,
  EMPTY_DEPS,
  EMPTY_UNSUBS,
  EMPTY_VERSIONS,
  unsubArrayPool,
  versionArrayPool,
} from '@/internal/pool';
import { scheduler } from '@/internal/scheduler';
import { type DependencyTracker, trackingContext, untracked } from '@/tracking';
import type { Dependency, EffectFunction, EffectObject, EffectOptions } from '@/types';
import { debug } from '@/utils/debug';
import { wrapError } from '@/utils/error';
import { isPromise } from '@/utils/type-guards';

/**
 * Internal context used during effect execution to track dependency changes.
 */
interface EffectContext {
  prevDeps: Dependency[];
  prevVersions: number[];
  prevUnsubs: (() => void)[];
  nextDeps: Dependency[];
  nextVersions: number[];
  nextUnsubs: (() => void)[];
}

/**
 * Internal effect implementation with dependency tracking and infinite loop detection.
 * Extends {@link ReactiveNode} and implements {@link EffectObject} and {@link DependencyTracker}.
 */

class EffectImpl extends ReactiveNode implements EffectObject, DependencyTracker {
  /** Current execution epoch for tracking freshness */
  private _currentEpoch: number;
  /** Epoch of the last scheduler flush */
  private _lastFlushEpoch: number;
  /** Number of executions within the current flush */
  private _executionsInEpoch: number;

  /** The effect function to execute */
  private readonly _fn: EffectFunction;
  /** Whether to execute synchronously on dependency change */
  private readonly _sync: boolean;
  /** Maximum allowed executions per second */
  private readonly _maxExecutions: number;
  /** Maximum allowed executions per scheduler flush */
  private readonly _maxExecutionsPerFlush: number;
  /** Whether to track if dependencies are modified during execution */
  private readonly _trackModifications: boolean;

  /** Cleanup function returned by the last execution */
  private _cleanup: (() => void) | null;
  /** Current active dependencies */
  private _dependencies: Dependency[];
  /** Cached versions of dependencies at last execution */
  private _dependencyVersions: number[];
  /** Unsubscribe functions for current dependencies */
  private _unsubscribes: (() => void)[];
  /** Temporary storage for dependencies being tracked in current execution */
  private _nextDeps: Dependency[] | null;
  /** Temporary storage for dependency versions being tracked in current execution */
  private _nextVersions: number[] | null;
  /** Temporary storage for unsubscribes being tracked in current execution */
  private _nextUnsubs: (() => void)[] | null;
  /** Execution timestamps for rate limiting (dev only) */
  private _history: number[] | null;
  /** Total number of executions */
  private _executionCount: number;

  /** Pointer for circular buffer history */
  private _historyPtr: number;
  /** Capacity of the history buffer */
  private readonly _historyCapacity: number;
  /** Error handler callback */
  private readonly _onError: ((error: unknown) => void) | null;

  /**
   * Creates a new EffectImpl instance.
   * @param fn - The effect function to run.
   * @param options - Configuration options for the effect.
   */

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    super();

    this._currentEpoch = -1;
    this._lastFlushEpoch = -1;
    this._executionsInEpoch = 0;

    this._fn = fn;
    this._sync = options.sync ?? false;
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;
    this._trackModifications = options.trackModifications ?? false;

    this._cleanup = null;
    this._dependencies = EMPTY_DEPS;
    this._dependencyVersions = EMPTY_VERSIONS;
    this._unsubscribes = EMPTY_UNSUBS;
    this._nextDeps = null;
    this._nextVersions = null;
    this._nextUnsubs = null;
    this._onError = options.onError ?? null;

    this._historyPtr = 0;
    // Capacity = Max executions + 1 (to check the window of N+1 executions)
    this._historyCapacity = this._maxExecutions + 1;

    // Pre-allocate array for circular buffer in Dev mode to avoid dynamic resizing
    this._history = IS_DEV ? new Array(this._historyCapacity).fill(0) : null;
    this._executionCount = 0;

    debug.attachDebugInfo(this, 'effect', this.id);
  }

  /**
   * Manually triggers effect execution.
   * Forces re-execution even if dependencies haven't changed.
   * @throws {EffectError} If the effect is already disposed.
   */
  public run = (): void => {
    if (this.isDisposed) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
    }
    if (this._dependencyVersions !== EMPTY_VERSIONS) {
      versionArrayPool.release(this._dependencyVersions);
      this._dependencyVersions = EMPTY_VERSIONS as number[];
    }
    this.execute();
  };

  /**
   * Disposes of the effect, cleaning up all subscriptions and resources.
   * Prevents further executions and releases arrays back to pools.
   */
  public dispose = (): void => {
    if (this.isDisposed) return;

    this._setDisposed();
    this._safeCleanup();

    if (this._unsubscribes !== EMPTY_UNSUBS) {
      for (let i = 0; i < this._unsubscribes.length; i++) {
        const unsub = this._unsubscribes[i];
        if (unsub) unsub();
      }
      unsubArrayPool.release(this._unsubscribes);
      this._unsubscribes = EMPTY_UNSUBS;
    }

    if (this._dependencies !== EMPTY_DEPS) {
      depArrayPool.release(this._dependencies);
      this._dependencies = EMPTY_DEPS;
    }

    if (this._dependencyVersions !== EMPTY_VERSIONS) {
      versionArrayPool.release(this._dependencyVersions);
      this._dependencyVersions = EMPTY_VERSIONS;
    }
  };

  /**
   * Adds a dependency to the current tracking context.
   * Called automatically when a reactive node is accessed during execution.
   * @param dep - The dependency to track.
   */
  public addDependency = (dep: Dependency): void => {
    if (this.isExecuting && this._nextDeps && this._nextUnsubs && this._nextVersions) {
      const epoch = this._currentEpoch;

      if (dep._lastSeenEpoch === epoch) return;
      dep._lastSeenEpoch = epoch;

      this._nextDeps.push(dep);
      this._nextVersions.push(dep.version);

      if (dep._tempUnsub) {
        this._nextUnsubs.push(dep._tempUnsub);
        dep._tempUnsub = undefined;
      } else {
        this._subscribeTo(dep);
      }
    }
  };

  /**
   * Executes the effect function.
   * Handles dependency tracking, cleanup, and infinite loop protection.
   * If the function returns a cleanup function or a Promise, it will be handled accordingly.
   */
  public execute = (): void => {
    if (this.isDisposed || this.isExecuting) return;
    if (!this._shouldExecute()) return;

    this._checkInfiniteLoop();
    this._setExecuting(true);
    this._safeCleanup();

    const context = this._prepareEffectContext();
    let committed = false;

    try {
      const result = trackingContext.run(this, this._fn);

      this._commitEffect(context);
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
            this._handleExecutionError(error);
          });
      } else {
        this._cleanup = typeof result === 'function' ? result : null;
      }
    } catch (error) {
      committed = true;
      this._handleExecutionError(error);
      this._cleanup = null;
    } finally {
      this._cleanupEffect(context, committed);
      this._setExecuting(false);
    }
  };

  /**
   * Prepares the execution context by acquiring pools and setting up epoch.
   * @returns The prepared EffectContext.
   */
  private _prepareEffectContext(): EffectContext {
    const prevDeps = this._dependencies;
    const prevVersions = this._dependencyVersions;
    const prevUnsubs = this._unsubscribes;
    const nextDeps = depArrayPool.acquire();
    const nextVersions = versionArrayPool.acquire();
    const nextUnsubs = unsubArrayPool.acquire();
    const epoch = nextEpoch();

    if (prevDeps !== EMPTY_DEPS && prevUnsubs !== EMPTY_UNSUBS) {
      for (let i = 0; i < prevDeps.length; i++) {
        const dep = prevDeps[i];
        if (dep) dep._tempUnsub = prevUnsubs[i];
      }
    }

    this._nextDeps = nextDeps;
    this._nextVersions = nextVersions;
    this._nextUnsubs = nextUnsubs;
    this._currentEpoch = epoch;

    return { prevDeps, prevVersions, prevUnsubs, nextDeps, nextVersions, nextUnsubs };
  }

  /**
   * Commits the tracked dependencies as the current active dependencies.
   * @param ctx - The current effect context.
   */
  private _commitEffect(ctx: EffectContext): void {
    // Structural Guarantee: nextDeps length is controlled by the tracking phase
    // We use the context's nextDeps directly, avoiding `this._nextDeps!`
    const trackedCount = ctx.nextDeps.length;

    ctx.nextDeps.length = trackedCount;
    ctx.nextVersions.length = trackedCount;

    this._dependencies = ctx.nextDeps;
    this._dependencyVersions = ctx.nextVersions;
    this._unsubscribes = ctx.nextUnsubs;
  }

  /**
   * Cleans up the effect execution context, releasing resources back to pools.
   * @param ctx - The effect context to clean up.
   * @param committed - Whether the changes were committed to the effect.
   */
  private _cleanupEffect(ctx: EffectContext, committed: boolean): void {
    this._nextDeps = null;
    this._nextVersions = null;
    this._nextUnsubs = null;

    if (committed) {
      if (ctx.prevDeps !== EMPTY_DEPS) {
        for (let i = 0; i < ctx.prevDeps.length; i++) {
          const dep = ctx.prevDeps[i];
          if (dep?._tempUnsub) {
            dep._tempUnsub();
            dep._tempUnsub = undefined;
          }
        }
        depArrayPool.release(ctx.prevDeps);
      }
      if (ctx.prevUnsubs !== EMPTY_UNSUBS) {
        unsubArrayPool.release(ctx.prevUnsubs);
      }
      if (ctx.prevVersions !== EMPTY_VERSIONS) {
        versionArrayPool.release(ctx.prevVersions);
      }
    } else {
      depArrayPool.release(ctx.nextDeps);
      versionArrayPool.release(ctx.nextVersions);
      for (let i = 0; i < ctx.nextUnsubs.length; i++) {
        ctx.nextUnsubs[i]?.();
      }
      unsubArrayPool.release(ctx.nextUnsubs);

      if (ctx.prevDeps !== EMPTY_DEPS) {
        for (let i = 0; i < ctx.prevDeps.length; i++) {
          const dep = ctx.prevDeps[i];
          if (dep) dep._tempUnsub = undefined;
        }
      }
    }
  }

  /**
   * Subscribes to a dependency's changes.
   * @param dep - The dependency to subscribe to.
   */
  private _subscribeTo(dep: Dependency): void {
    try {
      const unsubscribe = dep.subscribe(() => {
        if (this._trackModifications && this.isExecuting) {
          dep._modifiedAtEpoch = this._currentEpoch;
        }

        if (this._sync) {
          this.execute();
        } else {
          scheduler.schedule(this.execute);
        }
      });
      if (this._nextUnsubs) {
        this._nextUnsubs.push(unsubscribe);
      }
    } catch (error) {
      console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED));
      if (this._nextUnsubs) this._nextUnsubs.push(() => {});
    }
  }

  /**
   * Whether the effect has been disposed.
   */
  get isDisposed(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }

  /**
   * Total number of times this effect has executed.
   */
  get executionCount(): number {
    return this._executionCount;
  }

  /**
   * Whether the effect is currently executing.
   */
  get isExecuting(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  private _setDisposed(): void {
    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;
  }

  private _setExecuting(value: boolean): void {
    const mask = EFFECT_STATE_FLAGS.EXECUTING;
    this.flags = (this.flags & ~mask) | (-Number(value) & mask);
  }

  /**
   * Executes the cleanup function if it exists.
   */
  private _safeCleanup(): void {
    if (this._cleanup) {
      try {
        this._cleanup();
      } catch (error) {
        console.error(wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED));
      }
      this._cleanup = null;
    }
  }

  /**
   * Checks for infinite loops by tracking execution counts within a flush and time period.
   * @throws {EffectError} If an infinite loop is detected.
   */
  private _checkInfiniteLoop(): void {
    if (this._lastFlushEpoch !== flushEpoch) {
      this._lastFlushEpoch = flushEpoch;
      this._executionsInEpoch = 0;
    }

    this._executionsInEpoch++;

    if (this._executionsInEpoch > this._maxExecutionsPerFlush) {
      this._throwInfiniteLoopError('per-effect');
    }

    if (incrementFlushExecutionCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
      this._throwInfiniteLoopError('global');
    }

    this._executionCount++;

    if (this._history && this._maxExecutions > 0) {
      const now = Date.now();
      const ptr = this._historyPtr;
      const capacity = this._historyCapacity;

      // 1. Record current timestamp
      this._history[ptr] = now;

      // 2. Check the oldest timestamp in our window (O(1) lookback)
      // The slot (ptr + 1) % capacity holds the oldest recorded timestamp in the circular buffer
      // (or 0 if not yet filled).
      const oldestPtr = (ptr + 1) % capacity;
      const oldestTime = this._history[oldestPtr] ?? 0;

      // 3. Update pointer
      this._historyPtr = oldestPtr;

      // 4. Check if we exceeded the rate limit
      // If the oldest time (capacity steps ago) is within 1 second of now, we are too fast.
      // We check > 0 to ensure the buffer is filled at least once.
      if (oldestTime > 0 && now - oldestTime < TIME_CONSTANTS.ONE_SECOND_MS) {
        const error = new EffectError(
          `Effect executed ${capacity} times within 1 second. Infinite loop suspected`
        );
        this.dispose();
        console.error(error);
        if (this._onError) this._onError(error);

        if (IS_DEV) {
          throw error;
        }
      }
    }
  }

  private _throwInfiniteLoopError(type: 'per-effect' | 'global'): never {
    const error = new EffectError(
      `Infinite loop detected (${type}): ` +
        `effect executed ${this._executionsInEpoch} times in current flush. ` +
        `Total executions in flush: ${flushExecutionCount}`
    );
    this.dispose();
    console.error(error);
    throw error;
  }

  /**
   * Determines if the effect should execute based on dependency versions.
   * @returns true if any dependency has changed or if it's the first run.
   */
  private _shouldExecute(): boolean {
    // Early exit: no deps or no version cache means first run or invalidated
    if (this._dependencies === EMPTY_DEPS || this._dependencyVersions === EMPTY_VERSIONS)
      return true;

    for (let i = 0; i < this._dependencies.length; i++) {
      const dep = this._dependencies[i];
      if (!dep) continue;

      if ('value' in dep) {
        try {
          untracked(() => (dep as { value: unknown }).value);
        } catch {
          return true;
        }
      }

      if (dep.version !== this._dependencyVersions[i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Handles errors occurring during effect execution.
   * Wraps the error, logs it to console, and calls onError callback if provided.
   */
  private _handleExecutionError(error: unknown): void {
    const errorObj = wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED);
    console.error(errorObj);
    if (this._onError) this._onError(errorObj);
  }

  /**
   * Checks for potential infinite loops where an effect modifies its own dependencies.
   * Only active if trackModifications is enabled and debug is on.
   */
  private _checkLoopWarnings(): void {
    if (this._trackModifications && debug.enabled) {
      const dependencies = this._dependencies;
      for (let i = 0; i < dependencies.length; i++) {
        const dep = dependencies[i];
        if (dep && dep._modifiedAtEpoch === this._currentEpoch) {
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
 * Creates a reactive effect that re-executes when its dependencies change.
 *
 * An effect automatically tracks any reactive state (atoms, computed) accessed during its execution.
 * When those dependencies change, the effect is scheduled for re-execution.
 *
 * @param fn - The effect function to execute. Can return a cleanup function or a Promise that resolves to one.
 * @param options - Configuration options for the effect.
 * @param options.sync - If true, the effect runs synchronously when dependencies change. Defaults to false (scheduled).
 * @param options.maxExecutionsPerSecond - Rate limiting for the effect.
 * @param options.trackModifications - If true, warns when an effect modifies its own dependencies.
 * @returns An object representing the effect with `run()` and `dispose()` methods.
 * @throws {EffectError} If `fn` is not a function.
 *
 * @example
 * ```ts
 * const count = atom(0);
 * const stop = effect(() => {
 *   console.log('Count changed:', count.value);
 *   return () => console.log('Cleaning up...');
 * });
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
