import {
  DEBUG_CONFIG,
  EFFECT_STATE_FLAGS,
  EPOCH_CONSTANTS,
  IS_DEV,
  SCHEDULER_CONFIG,
} from '@/constants';
import { ReactiveNode } from '@/core/base';
import { EffectError, ERROR_MESSAGES, wrapError } from '@/errors';
import { BRAND, BrandFlags } from '@/symbols';
import type { Dependency, EffectFunction, EffectObject, EffectOptions } from '@/types';
import { debug } from '@/utils/debug';
import { isPromise } from '@/utils/type-guards';
import { DepSlotBuffer } from './buffers';
import {
  currentFlushEpoch,
  flushExecutionCount,
  incrementFlushExecutionCount,
  nextEpoch,
  scheduler,
} from './scheduler';
import { DependencyLink, type DependencyTracker, trackingContext } from './tracking';

/**
 * Internal implementation of an {@link EffectObject}.
 *
 * This class orchestrates the lifecycle, dependency tracking, and execution
 * scheduling for reactive side effects. It provides built-in protection against
 * infinite reactive loops and manages both synchronous and asynchronous execution
 * paths, including automatic cleanup handling.
 */
class EffectImpl extends ReactiveNode<void> implements EffectObject, DependencyTracker {
  /** @internal */
  readonly [BRAND] = BrandFlags.Effect;

  // Bookkeeping fields grouped for V8 SMI optimization
  private _currentEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  private _lastFlushEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  private _executionsInEpoch = 0;
  private _executionCount = 0;
  private _windowStart = 0;
  private _windowCount = 0;
  private _execId = 0;
  private _trackCount = 0;

  private _cleanup: (() => void) | null = null;
  /** Buffered storage for the node's dependencies. */
  _deps = new DepSlotBuffer();

  /**
   * A pre-allocated callback used to notify the scheduler of changes.
   * Optimization: This eliminates closure allocation overhead per dependency subscription.
   */
  private readonly _notifyCallback: () => void;

  private readonly _onError: ((error: unknown) => void) | null;

  private readonly _fn: EffectFunction;
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    super();
    this._fn = fn;
    this._onError = options.onError ?? null;
    this._sync = options.sync ?? false;
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;

    // Optimization: Callbacks are pre-allocated once to minimize heap pressure during dependency registration.
    if (this._sync) {
      this._notifyCallback = () => this.execute();
    } else {
      this._notifyCallback = () => scheduler.schedule(this);
    }

    debug.attachDebugInfo(this, 'effect', this.id, options.name);
  }

  /**
   * Manually triggers the execution of the side effect.
   *
   * @throws {EffectError} If the effect has been disposed.
   */
  public run(): void {
    if (this.isDisposed) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    }
    this.execute(true);
  }

  /**
   * Disposes of the effect, terminating future executions and clearing all dependency subscriptions.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;

    this._execCleanup();
    this._deps?.disposeAll();
  }

  /**
   * Records a dependency on a reactive node during the effect's execution.
   *
   * Logic: This method implements the standard dependency capture logic, including
   * O(1) link reuse ("claiming") to minimize setup overhead during re-execution cycles.
   *
   * @internal
   */
  public addDependency(dep: Dependency): void {
    // Constraint: Dependencies are only captured while the effect is actively executing.
    if ((this.flags & EFFECT_STATE_FLAGS.EXECUTING) === 0) return;

    if (dep._lastSeenEpoch === this._currentEpoch) return;
    dep._lastSeenEpoch = this._currentEpoch;

    const trackIndex = this._trackCount++;
    const deps = this._deps;
    const version = dep.version;

    const existing = deps.at(trackIndex);

    if (existing !== null && existing.node === dep) {
      existing.version = version;
    } else if (!deps.claimExisting(dep, trackIndex)) {
      this._insertNewDependency(dep, trackIndex, version);
    }

    if (dep.isComputed && !deps.hasComputeds) {
      deps.hasComputeds = true;
    }
  }

  private _insertNewDependency(dep: Dependency, trackIndex: number, version: number): void {
    let link: DependencyLink;
    try {
      const unsubscribe = dep.subscribe(this._notifyCallback);
      link = new DependencyLink(dep, version, unsubscribe);
    } catch (error) {
      const wrapped = wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED);
      console.error(wrapped);
      if (this._onError) {
        try {
          this._onError(wrapped);
        } catch {
          // Failure in error callback is suppressed to prevent interruption.
        }
      }
      link = new DependencyLink(dep, version, undefined);
    }

    this._deps.insertNew(trackIndex, link);
  }

  /**
   * Executes the side effect logic in a transactional context.
   *
   * Logic: The execution phase handles re-entrancy protection, cleanup rotation,
   * and dependency tracking. It incorporates dirty checking to avoid redundant
   * executions and implements infinite loop detection to ensure system stability.
   *
   * @param force - If true, bypasses dependency validation and executes immediately.
   */
  public execute(force = false): void {
    const flags = this.flags;
    if ((flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) !== 0) return;

    const deps = this._deps;
    // Optimization: Short-circuit execution if dependencies are stable.
    if (!force && deps.capacity > 0 && !this._isDirty()) return;

    this._checkInfiniteLoops();
    debug.trackUpdate(this.id, debug.getDebugName(this));

    this.flags = flags | EFFECT_STATE_FLAGS.EXECUTING;
    this._execCleanup();

    this._currentEpoch = nextEpoch();
    this._trackCount = 0;
    deps.prepareTracking();
    this._hotIndex = -1;

    let committed = false;
    try {
      const result = trackingContext.run(this, this._fn);

      deps.truncateFrom(this._trackCount);
      committed = true;

      if (typeof result === 'function') {
        this._cleanup = result as () => void;
      } else if (isPromise(result)) {
        this._handleAsyncResult(result);
      } else {
        this._cleanup = null;
      }
    } catch (error) {
      // Reason: Maintain consistent dependency list state even if execution fails to allow for recovery.
      if (!committed) {
        try {
          deps.truncateFrom(this._trackCount);
        } catch (commitErr) {
          if (IS_DEV) {
            console.warn('[atom-effect] _commitDeps failed during error recovery:', commitErr);
          }
        }
      }
      this._handleExecutionError(error);
      this._cleanup = null;
    } finally {
      this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
    }
  }

  private _handleAsyncResult(promise: Promise<unknown>): void {
    const execId = ++this._execId;
    promise.then(
      (cleanup) => {
        // Logic: Cancel resolution if a new execution cycle has started (async drift) or if disposed.
        if (execId !== this._execId || (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0) {
          if (typeof cleanup === 'function') {
            try {
              cleanup();
            } catch (e) {
              this._handleExecutionError(e, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
            }
          }
          return;
        }
        if (typeof cleanup === 'function') this._cleanup = cleanup as () => void;
      },
      (err) => execId === this._execId && this._handleExecutionError(err)
    );
  }

  protected override _isDirty(): boolean {
    const deps = this._deps;
    const length = deps.length;
    if (length === 0) return false;

    const hotIndex = this._hotIndex;
    if (hotIndex !== -1 && hotIndex < length) {
      const link = deps.at(hotIndex);
      if (link !== null) {
        const dep = link.node;
        // Optimization: Pure nodes (atoms) can bypass context switching during dirty checks.
        if (!dep.isComputed && dep.version !== link.version) return true;
      }
    }

    return this._deepDirtyCheck();
  }

  /**
   * Exhaustively validates the dependency graph before execution.
   */
  protected override _deepDirtyCheck(): boolean {
    const deps = this._deps;
    const length = deps.length;
    const hotIdx = this._hotIndex;

    // Caution: Tracking must be disabled during validation to prevent unintentional subscriptions.
    const prevContext = trackingContext.current;
    trackingContext.current = null;

    try {
      for (let i = 0; i < length; i++) {
        if (i === hotIdx) continue;
        const link = deps.at(i);
        if (link === null) continue;

        const dep = link.node;
        if (dep.isComputed) {
          try {
            // Logic: Trigger validation of the computed dependency by accessing its getter.
            void (dep as { value: unknown }).value;
          } catch {
            if (IS_DEV) {
              console.warn(`[atom-effect] Dependency #${dep.id} error in check`);
            }
          }
        }

        if (dep.version !== link.version) {
          this._hotIndex = i;
          return true;
        }
      }
      this._hotIndex = -1;
      return false;
    } finally {
      trackingContext.current = prevContext;
    }
  }

  private _execCleanup(): void {
    const cleanup = this._cleanup;
    if (cleanup == null) return;
    this._cleanup = null;
    try {
      cleanup();
    } catch (error) {
      this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
    }
  }

  /**
   * Monitors and enforces thresholds to prevent infinite reactive loops.
   */
  private _checkInfiniteLoops(): void {
    const epoch = currentFlushEpoch();
    if (this._lastFlushEpoch !== epoch) {
      this._lastFlushEpoch = epoch;
      this._executionsInEpoch = 0;
    }

    const executions = ++this._executionsInEpoch;
    // Constraint: Limit executions per flush to prevent runaway effects from hanging the process.
    if (executions > this._maxExecutionsPerFlush) this._throwInfiniteLoopError('per-effect');

    const globalExecutions = incrementFlushExecutionCount();
    if (globalExecutions > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
      this._throwInfiniteLoopError('global');
    }

    this._executionCount++;

    if (IS_DEV) this._checkFrequencyLimit();
  }

  private _checkFrequencyLimit(): void {
    if (!Number.isFinite(this._maxExecutions)) return;

    const now = Date.now();
    if (now - this._windowStart >= DEBUG_CONFIG.EFFECT_FREQUENCY_WINDOW) {
      this._windowStart = now;
      this._windowCount = 1;
      return;
    }

    if (++this._windowCount > this._maxExecutions) {
      const err = new EffectError(ERROR_MESSAGES.EFFECT_FREQUENCY_LIMIT_EXCEEDED);
      this.dispose();
      this._handleExecutionError(err);
      throw err;
    }
  }

  /** The total number of times this effect has executed since creation. */
  get executionCount(): number {
    return this._executionCount;
  }

  /** Indicates whether the effect is currently executing. */
  get isExecuting(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  /** Indicates whether the effect has been disposed. */
  get isDisposed(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }

  private _throwInfiniteLoopError(type: 'per-effect' | 'global'): never {
    const error = new EffectError(
      `Infinite loop detected (${type}): effect executed ${this._executionsInEpoch} times in current flush. Total executions in flush: ${flushExecutionCount}`
    );
    this.dispose();
    console.error(error);
    throw error;
  }

  private _handleExecutionError(
    error: unknown,
    message: string = ERROR_MESSAGES.EFFECT_EXECUTION_FAILED
  ): void {
    const errorObj = wrapError(error, EffectError, message);
    console.error(errorObj);
    if (this._onError) {
      try {
        this._onError(errorObj);
      } catch (e) {
        console.error(wrapError(e, EffectError, ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER));
      }
    }
  }
}

/**
 * Creates and starts a reactive effect that automatically re-runs in response to state changes.
 *
 * When to use:
 * - To perform side effects such as DOM updates, logging, or data fetching.
 * - To synchronize external systems or non-reactive components with the reactive state.
 *
 * @param fn - The function containing side effect logic. Can return a cleanup function or a Promise.
 * @param options - Configuration for synchronous execution, frequency thresholds, or error handling.
 * @returns A handle to the effect instance for manual management.
 * @throws {EffectError} If the provided parameter is not a function.
 *
 * @example
 * ```typescript
 * import { atom, effect } from '@but212/atom-effect';
 *
 * const count = atom(0);
 * const handle = effect(() => {
 *   console.log(`Current: ${count.value}`);
 *   return () => console.log('Cleaning up...');
 * });
 *
 * count.value++; // Console: "Cleaning up...", "Current: 1"
 * ```
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  const effectInstance = new EffectImpl(fn, options);
  // Logic: Effects run immediately upon creation to capture the initial dependency set.
  effectInstance.execute();

  return effectInstance;
}
