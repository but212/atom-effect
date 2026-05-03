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

  /** @internal */
  private _trackEpoch = EPOCH_CONSTANTS.UNINITIALIZED as number;
  /** @internal */
  private _trackCount = 0;
  /** @internal */
  private _trackSessionId = 0;

  private _budgetLoopCount = 0;
  private _budgetLastFlushEpoch = EPOCH_CONSTANTS.UNINITIALIZED as number;
  private _budgetWindowCount = 0;
  private _budgetWindowStart = 0;
  private _budgetTotalExecutions = 0;

  /** Buffered storage for reconciled subscriptions. @internal */
  _deps = createDepBuffer();

  private _cleanup: Option<() => void> = Option.none;

  private readonly _fn: EffectFunction;
  private readonly _onError: Option<(error: unknown) => void>;
  private readonly _notifyCallback: () => void;

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

  // --- Public API ---

  public run(): void {
    if (this.isDisposed) throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    this.execute(true);
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;

    this._execCleanup();
    if (this._deps) disposeAll(this._deps);
  }

  /** Total executions since initialization. */
  get executionCount(): number {
    return this._budgetTotalExecutions;
  }

  /** True if the effect function is currently on the stack. */
  get isExecuting(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  /** True if the effect has been stopped. */
  get isDisposed(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }

  // --- Core Execution Pipeline ---

  /**
   * Main execution cycle of the effect.
   *
   * Logic: Lifecycle Orchestration
   * 1. Prepare: Check flags, budgets, and dirty state.
   * 2. Cleanup: Execute previous session's teardown.
   * 3. Track: Run user function within reactive context.
   * 4. Finalize: Commit dependencies and handle result/error.
   */
  public execute(force = false): void {
    if (!this._prepareExecution(force)) return;

    this._execCleanup();
    const result = this._runTrackingSession();
    this._finalizeExecution(result);
  }

  private _prepareExecution(force: boolean): boolean {
    const flags = this.flags;
    if ((flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) !== 0) return false;

    // Logic: Skip execution if not forced and no actual changes detected.
    if (!(force || this._deps.slots.length === 0 || this._isDirty())) return false;

    this._validateBudget();
    debug.trackUpdate(this.id, debug.getDebugName(this));

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    return true;
  }

  private _runTrackingSession(): Result<unknown, Error> {
    this._startTracking();
    const prevDepth = trackingContext.depth;

    return Result.tryCatch(() => {
      try {
        return trackingContext.run(this, this._fn);
      } catch (e) {
        trackingContext.rollback(prevDepth);
        throw e;
      }
    });
  }

  private _finalizeExecution(result: Result<unknown, Error>): void {
    this._commitDeps();

    Result.match(result, {
      ok: (val) => {
        this._handleResult(val);
      },
      err: (e) => {
        this._handleExecutionError(e);
      },
    });

    this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
  }

  // --- Dependency Management ---

  public addDependency(dep: Dependency): void {
    if (!this.isExecuting) return;

    if (dep._lastSeenEpoch === this._trackEpoch) return;
    dep._lastSeenEpoch = this._trackEpoch;

    const trackIndex = this._trackCount++;
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
    const unsubscribe = dep.subscribe(this._notifyCallback);
    const link = createDependencyLink(dep, version, unsubscribe);
    insertNew(this._deps, trackIndex, link);
  }

  private _startTracking(): void {
    this._trackEpoch = nextEpoch();
    this._trackCount = 0;
    prepareTracking(this._deps);
  }

  private _commitDeps(): void {
    try {
      depBufferTruncateFrom(this._deps, this._trackCount);
    } catch (commitErr) {
      if (IS_DEV) {
        console.warn('[atom-effect] _commitDeps failed during error recovery:', commitErr);
      }
    }
  }

  // --- Result & Cleanup Handling ---

  private _handleResult(val: unknown): void {
    if (typeof val === 'function') {
      this._cleanup = Option.some(val as () => void);
    } else if (isPromise(val)) {
      this._handleAsyncResult(val as Promise<undefined | (() => void)>);
    } else {
      this._cleanup = Option.none;
    }
  }

  private _handleAsyncResult(promise: Promise<unknown>): void {
    const sessionId = ++this._trackSessionId;

    promise.then(
      (cleanup) => {
        if (this._trackSessionId !== sessionId || this.isDisposed) {
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
      (err) => {
        if (this._trackSessionId === sessionId) {
          this._handleExecutionError(err);
        }
      }
    );
  }

  private _execCleanup(): void {
    const cleanupOpt = this._cleanup;
    if (Option.isNone(cleanupOpt)) return;

    this._cleanup = Option.none;
    const fn = cleanupOpt.value;

    try {
      fn();
    } catch (e) {
      this._handleExecutionError(e as Error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
    }
  }

  // --- Budget & Safeguards ---

  private _validateBudget(): void {
    const epoch = currentFlushEpoch();

    if (this._budgetLastFlushEpoch !== epoch) {
      this._budgetLastFlushEpoch = epoch;
      this._budgetLoopCount = 0;
    }

    if (++this._budgetLoopCount > this._maxExecutionsPerFlush) {
      this._abortExecution('per-effect');
    }

    if (incrementFlushExecutionCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
      this._abortExecution('global');
    }

    this._budgetTotalExecutions++;
    if (IS_DEV) this._checkFrequencyLimit();
  }

  private _checkFrequencyLimit(): void {
    if (!Number.isFinite(this._maxExecutions)) return;

    const now = Date.now();

    if (now - this._budgetWindowStart >= DEBUG_CONFIG.EFFECT_FREQUENCY_WINDOW) {
      this._budgetWindowStart = now;
      this._budgetWindowCount = 1;
      return;
    }

    if (++this._budgetWindowCount > this._maxExecutions) {
      const err = new EffectError(ERROR_MESSAGES.EFFECT_FREQUENCY_LIMIT_EXCEEDED);
      this.dispose();
      this._handleExecutionError(err);
      throw err;
    }
  }

  private _abortExecution(type: 'per-effect' | 'global'): never {
    const message =
      type === 'per-effect'
        ? `Infinite loop detected (per-effect): executed ${this._budgetLoopCount} times in current flush.`
        : 'Infinite loop detected (global): exceeded total execution limit per flush.';

    const error = new EffectError(message);
    this.dispose();
    console.error(error);
    throw error;
  }

  private _handleExecutionError(
    error: unknown,
    message: string = ERROR_MESSAGES.EFFECT_EXECUTION_FAILED
  ): Result<never, Error> {
    const errorObj = wrapError(error, EffectError, message);
    console.error(errorObj);

    if (Option.isSome(this._onError)) {
      try {
        this._onError.value(errorObj);
      } catch (e) {
        console.error(wrapError(e, EffectError, ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER));
      }
    }
    return Result.err(errorObj);
  }

  /** @internal */
  protected override _isDirty(): boolean {
    return isBufferDirty(this._deps);
  }

  /** @internal */
  protected override _deepDirtyCheck(): boolean {
    return isBufferDirty(this._deps);
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
  effectInstance.execute();

  return effectInstance;
}
