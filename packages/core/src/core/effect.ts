import type { SlotBuffer } from '@but212/atom-effect-utils';
import {
  DEBUG_CONFIG,
  EFFECT_STATE_FLAGS,
  EPOCH_CONSTANTS,
  IS_DEV,
  SCHEDULER_CONFIG,
  SMI_MAX,
} from '@/constants';
import {
  createDependencyLink,
  currentFlushEpoch,
  incrementFlushExecutionCount,
  nextEpoch,
  rollbackTrackingSubscriber,
  runInTrackingContext,
  scheduler,
  schedulerSchedule,
  trackingContext,
} from '@/core/base';
import { EffectError, ERROR_MESSAGES, wrapError } from '@/errors';
import { BRAND, BrandFlags } from '@/symbols';
import type {
  DepBufferState,
  Dependency,
  DependencyId,
  DependencyTracker,
  EffectFunction,
  EffectObject,
  EffectOptions,
  ReactiveNode,
  Subscriber,
  Subscription,
} from '@/types';
import { debug, generateId, nodeIsDirty, nodeIsDisposed } from '@/utils';
import { isPromise } from '@/utils/type-guards';
import {
  claimExisting,
  createDepBuffer,
  depBufferTruncateFrom,
  disposeAll,
  insertNew,
  prepareTracking,
} from './buffers';

/**
 * Internal state for tracking effect execution budgets.
 * @internal
 */
export interface EffectBudgetState {
  loopCount: number;
  lastFlushEpoch: number;
  windowCount: number;
  windowStart: number;
  totalExecutions: number;
}

/**
 * Factory for effect budget state.
 * @internal
 */
export function createEffectBudgetState(): EffectBudgetState {
  return {
    loopCount: 0,
    lastFlushEpoch: EPOCH_CONSTANTS.UNINITIALIZED,
    windowCount: 0,
    windowStart: 0,
    totalExecutions: 0,
  };
}

/**
 * Logic: Effect Budget Validation
 * Ensures an effect doesn't run too many times in a single flush cycle,
 * preventing infinite loops.
 * @internal
 */
export function validateEffectBudget(
  state: EffectBudgetState,
  maxExecutionsPerFlush: number,
  currentFlushEpoch: number,
  incrementGlobalFlushCount: () => number,
  onAbort: (type: 'per-effect' | 'global') => never
): void {
  if (state.lastFlushEpoch !== currentFlushEpoch) {
    state.lastFlushEpoch = currentFlushEpoch;
    state.loopCount = 0;
  }

  if (++state.loopCount > maxExecutionsPerFlush) {
    onAbort('per-effect');
  }

  if (incrementGlobalFlushCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
    onAbort('global');
  }

  state.totalExecutions++;
}

/**
 * Logic: Frequency Limiter
 * Throttles effects that fire too rapidly in development mode.
 * @internal
 */
export function checkEffectFrequencyLimit(
  state: EffectBudgetState,
  maxExecutions: number,
  onLimitExceeded: () => never
): void {
  if (!Number.isFinite(maxExecutions)) return;

  const now = Date.now();

  if (now - state.windowStart >= DEBUG_CONFIG.EFFECT_FREQUENCY_WINDOW) {
    state.windowStart = now;
    state.windowCount = 1;
    return;
  }

  if (++state.windowCount > maxExecutions) {
    onLimitExceeded();
  }
}

/**
 * Implementation of a reactive side-effect.
 * @internal
 */
class EffectImpl implements EffectObject, DependencyTracker, Subscriber, ReactiveNode<void> {
  // ReactiveNode implementation
  flags: number = 0;
  version: number = 0;
  _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  _nextEpoch: number | undefined = undefined;
  readonly id: DependencyId = generateId() & SMI_MAX;
  _storage: {
    slots: SlotBuffer<Subscription<void>> | null;
    deps: DepBufferState | null;
  } = {
    slots: null,
    deps: createDepBuffer(),
  };

  /** @internal */
  readonly [BRAND] = BrandFlags.Effect;

  /** @internal */
  private _trackEpoch = EPOCH_CONSTANTS.UNINITIALIZED as number;
  /** @internal */
  private _trackCount = 0;
  /** @internal */
  private _trackSessionId = 0;

  private _budget = createEffectBudgetState();

  private _cleanup: (() => void) | null = null;

  private readonly _fn: EffectFunction;
  private readonly _onError: ((error: unknown) => void) | null;
  private readonly _notifyCallback: () => void;

  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    this._fn = fn;
    this._onError = options.onError ?? null;
    this._sync = options.sync ?? false;
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;

    this._notifyCallback = this._sync
      ? () => this.execute()
      : () => schedulerSchedule(scheduler, this);

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
    if (this._storage.deps) disposeAll(this._storage.deps!);
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
    return nodeIsDisposed(this);
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

    this._startTracking();
    const prevDepth = trackingContext.stack.length;

    let val: unknown;
    let hasError = false;
    let errorObj: unknown;

    try {
      try {
        val = runInTrackingContext(trackingContext, this, this._fn);
      } catch (e) {
        rollbackTrackingSubscriber(trackingContext, prevDepth);
        throw e;
      }
    } catch (e) {
      hasError = true;
      errorObj = e;
    }

    this._commitDeps();

    if (hasError) {
      this._handleExecutionError(errorObj);
    } else {
      this._handleResult(val);
    }

    this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
  }

  private _prepareExecution(force: boolean): boolean {
    const flags = this.flags;
    if ((flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) !== 0) return false;

    // Logic: Skip execution if not forced and no actual changes detected.
    if (!(force || this._storage.deps!.slots.length === 0 || nodeIsDirty(this))) return false;

    this._validateBudget();
    debug.trackUpdate(this.id, debug.getDebugName(this));

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    return true;
  }

  // --- Dependency Management ---

  public addDependency(dep: Dependency): void {
    if (!this.isExecuting) return;

    if (dep._lastSeenEpoch === this._trackEpoch) return;
    dep._lastSeenEpoch = this._trackEpoch;

    const trackIndex = this._trackCount++;
    const deps = this._storage.deps!;
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
    insertNew(this._storage.deps!, trackIndex, link);
  }

  private _startTracking(): void {
    this._trackEpoch = nextEpoch();
    this._trackCount = 0;
    prepareTracking(this._storage.deps!);
  }

  private _commitDeps(): void {
    try {
      depBufferTruncateFrom(this._storage.deps!, this._trackCount);
    } catch (commitErr) {
      if (IS_DEV) {
        console.warn('[atom-effect] _commitDeps failed during error recovery:', commitErr);
      }
    }
  }

  // --- Result & Cleanup Handling ---

  private _handleResult(val: unknown): void {
    if (typeof val === 'function') {
      this._cleanup = val as () => void;
    } else if (isPromise(val)) {
      this._handleAsyncResult(val as Promise<undefined | (() => void)>);
    } else {
      this._cleanup = null;
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

        if (typeof cleanup === 'function') this._cleanup = cleanup as () => void;
      },
      (err) => {
        if (this._trackSessionId === sessionId) {
          this._handleExecutionError(err);
        }
      }
    );
  }

  private _execCleanup(): void {
    const fn = this._cleanup;
    if (!fn) return;

    this._cleanup = null;

    try {
      fn();
    } catch (e) {
      this._handleExecutionError(e as Error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
    }
  }

  // --- Budget & Safeguards ---

  private _validateBudget(): void {
    validateEffectBudget(
      this._budget,
      this._maxExecutionsPerFlush,
      currentFlushEpoch(),
      incrementFlushExecutionCount,
      (type) => this._abortExecution(type)
    );

    if (IS_DEV) {
      checkEffectFrequencyLimit(this._budget, this._maxExecutions, () => {
        const err = new EffectError(ERROR_MESSAGES.EFFECT_FREQUENCY_LIMIT_EXCEEDED);
        this.dispose();
        this._handleExecutionError(err);
        throw err;
      });
    }
  }

  private _abortExecution(type: 'per-effect' | 'global'): never {
    const message =
      type === 'per-effect'
        ? `Infinite loop detected (per-effect): executed ${this._budget.loopCount} times in current flush.`
        : 'Infinite loop detected (global): exceeded total execution limit per flush.';

    const error = new EffectError(message);
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
