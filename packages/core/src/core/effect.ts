import { Option, Result } from '@but212/atom-effect-utils';
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
import {
  claimExisting,
  createDepBuffer,
  depBufferTruncateFrom,
  disposeAll,
  insertNew,
  isBufferDirty,
  prepareTracking,
} from './buffers';
import { currentFlushEpoch, incrementFlushExecutionCount, nextEpoch, scheduler } from './scheduler';
import { createDependencyLink, type DependencyTracker, trackingContext } from './tracking';

/**
 * Implementation of a reactive side-effect.
 * @internal
 */
class EffectImpl extends ReactiveNode<void> implements EffectObject, DependencyTracker {
  /** @internal */
  readonly [BRAND] = BrandFlags.Effect;

  /**
   * Logic: Tracking Session Data
   * @internal
   */
  private _session = {
    trackEpoch: EPOCH_CONSTANTS.UNINITIALIZED as number,
    trackCount: 0,
    sessionId: 0,
  };

  /**
   * Logic: Execution Budget Data
   * Tracks execution counts across different time windows to detect infinite loops.
   * @internal
   */
  private _budget = {
    loopCount: 0,
    lastFlushEpoch: EPOCH_CONSTANTS.UNINITIALIZED as number,
    windowCount: 0,
    windowStart: 0,
    totalExecutions: 0,
  };

  private _cleanup: Option<() => void> = Option.none;
  /**
   * Buffered storage for reconciled subscriptions.
   * @internal
   */
  _deps = createDepBuffer();

  /** @internal */
  private readonly _notifyCallback: () => void;

  private readonly _onError: Option<(error: unknown) => void>;

  private readonly _fn: EffectFunction;
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    super();
    this._fn = fn;
    this._onError = Option.fromNullable(options.onError);
    this._sync = options.sync ?? false;
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;

    this._notifyCallback = this._sync ? () => this.execute() : () => scheduler.schedule(this);

    debug.attachDebugInfo(this, 'effect', this.id, options.name);
  }

  /**
   * Manually triggers the effect.
   */
  public run(): void {
    if (this.isDisposed) throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    this.execute(true);
  }

  /**
   * Logic: Final Teardown
   * Disposes of all internal dependencies and executes the remaining cleanup function.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;

    this._execCleanup();
    if (this._deps) disposeAll(this._deps);
  }

  /**
   * Logic: Dependency Capture
   * Invoked by observed atoms during the execution phase.
   * Reuses existing subscriptions via O(1) reconciliation to minimize overhead.
   * @internal
   */
  public addDependency(dep: Dependency): void {
    if ((this.flags & EFFECT_STATE_FLAGS.EXECUTING) === 0) return;

    const session = this._session;
    if (dep._lastSeenEpoch === session.trackEpoch) return;
    dep._lastSeenEpoch = session.trackEpoch;

    const trackIndex = session.trackCount++;
    const deps = this._deps;
    const version = dep.version;

    const existing = deps.slots.at(trackIndex);

    if (existing?.node === dep) {
      existing.version = version;
    } else if (!claimExisting(deps, dep, trackIndex)) {
      this._insertNewDependency(dep, trackIndex, version);
    }

    if (dep.isComputed && !deps.hasComputeds) {
      deps.hasComputeds = true;
    }
  }

  private _insertNewDependency(dep: Dependency, trackIndex: number, version: number): void {
    const res = Result.tryCatch(() => dep.subscribe(this._notifyCallback));

    const link = Result.match(res, {
      ok: (unsubscribe) => createDependencyLink(dep, version, unsubscribe),
      err: (error) => {
        const wrapped = wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED);
        console.error(wrapped);
        this._handleExecutionError(wrapped);
        return createDependencyLink(dep, version, undefined);
      },
    });

    insertNew(this._deps, trackIndex, link);
  }

  /**
   * Main execution cycle of the effect.
   *
   * Logic: Lifecycle Orchestration
   * 1. Validate budgets (Loop protection).
   * 2. Execute previous cleanup.
   * 3. Run effect logic inside a tracking context.
   * 4. Truncate stale dependencies.
   */
  public execute(force = false): void {
    const flags = this.flags;
    if ((flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) !== 0) return;

    const shouldRun = force || this._deps.slots.length === 0 || this._isDirty();
    if (!shouldRun) return;

    this._validateBudget();

    debug.trackUpdate(this.id, debug.getDebugName(this));

    this.flags = flags | EFFECT_STATE_FLAGS.EXECUTING;
    this._execCleanup();
    this._startTracking();

    try {
      const result = trackingContext.run(this, this._fn);
      this._commitDeps();

      this._handleResult(result);
    } finally {
      this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
    }
  }

  /**
   * Logic: Multi-Layered Loop Protection
   * 1. Per-Effect Limit: Prevents a single effect from thrashing the scheduler.
   * 2. Global Limit: Detects distributed loops across multiple effects.
   * 3. Frequency Limit (Dev-only): Detects runaway loops across seconds.
   */
  private _validateBudget(): void {
    const epoch = currentFlushEpoch();
    const budget = this._budget;

    if (budget.lastFlushEpoch !== epoch) {
      budget.lastFlushEpoch = epoch;
      budget.loopCount = 0;
    }

    if (++budget.loopCount > this._maxExecutionsPerFlush) {
      this._abortExecution('per-effect');
    }

    if (incrementFlushExecutionCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
      this._abortExecution('global');
    }

    budget.totalExecutions++;
    if (IS_DEV) this._checkFrequencyLimit();
  }

  private _handleResult(result: unknown): void {
    Result.match(result as Result<unknown, Error>, {
      ok: (val) => {
        if (typeof val === 'function') {
          this._cleanup = Option.some(val as () => void);
        } else if (isPromise(val)) {
          this._handleAsyncResult(val as Promise<undefined | (() => void)>);
        } else {
          this._cleanup = Option.none;
        }
      },
      err: (e) => {
        this._handleExecutionError(e);
        this._cleanup = Option.none;
      },
    });
  }

  private _startTracking(): void {
    this._session.trackEpoch = nextEpoch();
    this._session.trackCount = 0;
    prepareTracking(this._deps);
  }

  private _commitDeps(): void {
    try {
      depBufferTruncateFrom(this._deps, this._session.trackCount);
    } catch (commitErr) {
      if (IS_DEV) {
        console.warn('[atom-effect] _commitDeps failed during error recovery:', commitErr);
      }
    }
  }

  /**
   * Logic: Async Cleanup Isolation
   * Prevents stale async cleanups from overwriting newer sessions using
   * unique session IDs.
   *
   * Constraint: Stale Discard
   * Cleanups are immediately executed and discarded if the effect was
   * disposed or re-triggered during the async wait.
   */
  private _handleAsyncResult(promise: Promise<unknown>): void {
    const sessionId = ++this._session.sessionId;

    promise.then(
      (cleanup) => {
        if (this._session.sessionId !== sessionId || this.isDisposed) {
          if (typeof cleanup === 'function') {
            try {
              cleanup();
            } catch (e) {
              this._handleExecutionError(e, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
            }
          }
          return;
        }
        if (typeof cleanup === 'function') this._cleanup = Option.some(cleanup as () => void);
      },
      (err) => this._session.sessionId === sessionId && this._handleExecutionError(err)
    );
  }

  /** @internal */
  protected override _isDirty(): boolean {
    return isBufferDirty(this._deps);
  }

  /** @internal */
  protected override _deepDirtyCheck(): boolean {
    return isBufferDirty(this._deps);
  }

  private _execCleanup(): void {
    const cleanupOpt = this._cleanup;
    if (Option.isNone(cleanupOpt)) return;
    this._cleanup = Option.none;
    try {
      cleanupOpt.value();
    } catch (error) {
      this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
    }
  }

  /**
   * Optimization: Development-Mode Loop Guard
   * Prevents browser hangs during development by tracking execution density
   * within a 1-second window.
   */
  private _checkFrequencyLimit(): void {
    if (!Number.isFinite(this._maxExecutions)) return;

    const now = Date.now();
    const budget = this._budget;

    if (now - budget.windowStart >= DEBUG_CONFIG.EFFECT_FREQUENCY_WINDOW) {
      budget.windowStart = now;
      budget.windowCount = 1;
      return;
    }

    if (++budget.windowCount > this._maxExecutions) {
      const err = new EffectError(ERROR_MESSAGES.EFFECT_FREQUENCY_LIMIT_EXCEEDED);
      this.dispose();
      this._handleExecutionError(err);
      throw err;
    }
  }

  /** Total executions since initialization. */
  get executionCount(): number {
    return this._budget.totalExecutions;
  }

  /** True if the effect function is currently on the stack. */
  get isExecuting(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  /** True if the effect has been stopped. */
  get isDisposed(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }

  private _abortExecution(type: 'per-effect' | 'global'): never {
    const error = new EffectError(
      `Infinite loop detected (${type}): executed ${this._budget.loopCount} times in current flush.`
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
    Option.match(this._onError, {
      some: (handler) => {
        try {
          handler(errorObj);
        } catch (e) {
          console.error(wrapError(e, EffectError, ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER));
        }
      },
      none: () => {},
    });
  }
}

/**
 * Creates a reactive side-effect.
 *
 * When to use:
 * - To synchronize reactive state with the DOM or external APIs.
 * - To perform logging or diagnostic tasks.
 * - To manage timers or subscriptions that depend on atom values.
 *
 * @example
 * ```typescript
 * const count = atom(0);
 * effect(() => {
 *   const el = document.getElementById('display')!;
 *   el.textContent = `Value: ${count.value}`;
 *
 *   // Optional teardown
 *   return () => console.log('Cleaning up effect...');
 * });
 * ```
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  const effectInstance = new EffectImpl(fn, options);
  // Logic: Effects run immediately to establish the initial dependency graph.
  effectInstance.execute();

  return effectInstance;
}
