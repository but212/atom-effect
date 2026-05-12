/**
 * @module Effects
 *
 * Responsibility:
 * Orchestrates reactive side-effects that synchronize internal state changes
 * with external systems (DOM, APIs, logging). Manages execution budgets and
 * automated resource cleanup.
 *
 * Design Intent:
 * Effects serve as terminal nodes in the reactive graph. They utilize an
 * automated tracking phase to capture dependencies and provide a structured
 * teardown mechanism for side-effects.
 */

import type { SlotBuffer } from '@but212/atom-effect-utils';
import {
  BRAND,
  BrandFlags,
  DEBUG_CONFIG,
  EFFECT_STATE_FLAGS,
  EPOCH_CONSTANTS,
  ERROR_MESSAGES,
  IS_DEV,
  KIND,
  SCHEDULER_CONFIG,
  SMI_MAX,
} from '@/constants';
import {
  nodeCommitDeps,
  nodeHandleError,
  nodeIsDirty,
  nodeIsDisposed,
  nodeStartTracking,
  nodeTrackDependency,
  rollbackTrackingSubscriber,
  runInTrackingContext,
  trackingContext,
} from '@/core/base';
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
import { debug, EffectError, generateId } from '@/utils';
import { isPromise } from '@/utils/type-guards';
import { createDepBuffer, disposeAll, prepareTracking } from './buffers';
import {
  currentFlushEpoch,
  incrementFlushExecutionCount,
  scheduler,
  schedulerSchedule,
} from './scheduler';

/**
 * Role: State container for monitoring effect execution health.
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
 * Role: Factory for initializing effect budget monitors.
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
 * Logic: Execution Budget Validation
 * Enforces limits on the number of times an effect can fire within a single
 * flush cycle. This prevents runaway reactive loops that would otherwise
 * hang the main thread.
 *
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

  // Constraint: Global safeguard against aggregate scheduler instability.
  if (incrementGlobalFlushCount() > SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
    onAbort('global');
  }

  state.totalExecutions++;
}

/**
 * Logic: Frequency Throttling (Development Only)
 * Detects and intercepts effects that fire at a frequency suggesting
 * unintentional rapid updates or performance degradation.
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
 * Role: Orchestrator for a reactive side-effect.
 * @internal
 */
class EffectImpl implements EffectObject, DependencyTracker, Subscriber, ReactiveNode<void> {
  flags: number = 0;
  version: number = 0;
  _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  _nextEpoch: number | undefined = undefined;
  _k: typeof KIND.Obj = KIND.Obj;
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

  /** Triggers the effect execution immediately. */
  public run(): void {
    if (this.isDisposed) throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    this.execute(true);
  }

  /**
   * Logic: Final Resource Release
   * Releases all dependencies and executes the current cleanup handle.
   */
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

  /** Returns true if the effect is currently executing its function. */
  get isExecuting(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  /** Returns true if the effect has been permanently stopped. */
  get isDisposed(): boolean {
    return nodeIsDisposed(this);
  }

  /**
   * Logic: Execution Lifecycle Orchestration
   * Synchronizes the effect state with its captured dependencies.
   *
   * Strategy:
   * 1. Validate: Verify flags, budgets, and dirty state.
   * 2. Teardown: Invoke the cleanup handle from the previous session.
   * 3. Track: Run the user function within a tracking context.
   * 4. Finalize: Reconcile dependencies and process the returned value.
   */
  public execute(force = false): void {
    if (!this._prepareExecution(force)) return;

    this._execCleanup();

    nodeStartTracking(this);
    prepareTracking(this._storage.deps!);
    const prevDepth = trackingContext.stack.length;

    let val: unknown;
    let hasError = false;
    let errorObj: unknown;

    try {
      try {
        val = runInTrackingContext(trackingContext, this, this._fn);
      } catch (e) {
        // Impact: Preserves tracking context integrity if the effect crashes.
        rollbackTrackingSubscriber(trackingContext, prevDepth);
        throw e;
      }
    } catch (e) {
      hasError = true;
      errorObj = e;
    }

    nodeCommitDeps(this);

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

    // Logic: Selective Skipping
    // Skip if not forced and the dependency buffer remains clean.
    if (!(force || this._storage.deps!.slots.length === 0 || nodeIsDirty(this))) return false;

    this._validateBudget();
    debug.trackUpdate(this.id, debug.getDebugName(this));

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    return true;
  }

  /** Registers a dependency during the tracking session. */
  public addDependency(dep: Dependency): void {
    if (!this.isExecuting) return;
    nodeTrackDependency(this, dep, this._notifyCallback);
  }

  /**
   * Logic: Resolution Handling
   * Synchronously assigns the cleanup handle or delegates to the async handler.
   */
  private _handleResult(val: unknown): void {
    if (typeof val === 'function') {
      this._cleanup = val as () => void;
    } else if (isPromise(val)) {
      this._handleAsyncResult(val as Promise<undefined | (() => void)>);
    } else {
      this._cleanup = null;
    }
  }

  /**
   * Logic: Async Cleanup Tracking
   * Orchestrates cleanup handles returned from Promises. Uses session IDs
   * to discard stale handles from invalidated tracking cycles.
   */
  private _handleAsyncResult(promise: Promise<unknown>): void {
    const sessionId = ++this._trackSessionId;

    promise.then(
      (cleanup) => {
        if (this._trackSessionId !== sessionId || this.isDisposed) {
          // Logic: Stale or Disposed Teardown
          // If the handle arrived after a new session started, it is invoked
          // immediately and discarded to prevent memory leaks.
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

  /**
   * Logic: Safety Interruption
   * Terminates the effect and signals a terminal failure to prevent
   * system-wide instability from infinite loops.
   */
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
    nodeHandleError(this, error, EffectError, message, this._onError);
  }
}

/**
 * Creates a reactive side-effect to synchronize state with external systems.
 *
 * When to use:
 * - To update the DOM or integrate with third-party libraries.
 * - To perform logging, monitoring, or diagnostic tasks.
 * - To manage timers, network requests, or global subscriptions.
 *
 * @param fn - The function to execute. Can return a synchronous or asynchronous cleanup handle.
 * @param options - Configuration for execution limits, custom error handlers, and sync delivery.
 * @returns An `EffectObject` to manually run or dispose of the effect.
 *
 * @example
 * ```typescript
 * import { atom, effect } from '@but212/atom-effect';
 *
 * const count = atom(0);
 *
 * effect(() => {
 *   console.log('Value changed:', count.value);
 *
 *   // Optional teardown called before the next run or on disposal
 *   return () => console.log('Cleaning up...');
 * });
 *
 * count.value++; // Triggers "Value changed: 1"
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
