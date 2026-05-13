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
 * flush cycle to prevent runaway reactive loops that would hang the main thread.
 *
 * Constraint: Global Safeguard
 * Implements a secondary limit on total executions across all effects to protect
 * against aggregate scheduler instability.
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
 * Logic: Frequency Throttling
 * Detects effects firing at a frequency suggesting unintentional rapid updates.
 *
 * Caution: Performance Degradation
 * High-frequency updates can saturate the main thread even if they don't
 * trigger an infinite loop. This check is only active in development.
 *
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
 *
 * Optimization: Monomorphic Access
 * Uses public fields for core engine properties to ensure consistent V8 hidden
 * class shapes (monomorphic access) in the reactive hot-path.
 *
 * Logic: ES2022 Private Fields
 * Encapsulates internal state (budgets, cleanup handles) using private fields
 * to prevent accidental tampering and maintain clear ownership.
 *
 * @internal
 */
class EffectImpl implements EffectObject, DependencyTracker, Subscriber, ReactiveNode<void> {
  // Optimization: Engine-exposed state (Public JS fields)
  public flags: number = 0;
  public version: number = 0;
  public _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  public _nextEpoch: number | undefined = undefined;
  public _trackEpoch: number = 0;
  public _trackCount: number = 0;
  public _error: Error | null = null;
  public _k: typeof KIND.Obj = KIND.Obj;
  public readonly id: DependencyId = generateId() & SMI_MAX;

  public _storage: {
    slots: SlotBuffer<Subscription<void>> | null;
    deps: DepBufferState | null;
  } = {
    slots: null,
    deps: createDepBuffer(),
  };

  /** @internal */
  public readonly [BRAND] = BrandFlags.Effect;

  // Logic: Concurrency Control
  // Session IDs ensure that cleanup handles from asynchronous operations are
  // discarded if a new tracking cycle starts before the Promise resolves.
  #trackSessionId = 0;
  #budget = createEffectBudgetState();
  #cleanup: (() => void) | null = null;

  #fn: EffectFunction;
  #onError: ((error: unknown) => void) | null;
  #notifyCallback: () => void;

  #sync: boolean;
  #maxExecutions: number;
  #maxExecutionsPerFlush: number;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    this.#fn = fn;
    this.#onError = options.onError ?? null;
    this.#sync = options.sync ?? false;
    this.#maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this.#maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;

    this.#notifyCallback = this.#sync
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

    this.#execCleanup();
    if (this._storage.deps) disposeAll(this._storage.deps!);
  }

  /** Total executions since initialization. */
  get executionCount(): number {
    return this.#budget.totalExecutions;
  }

  /** Returns true if the effect is currently executing its function. */
  get isExecuting(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  /** Returns true if the effect has been permanently stopped. */
  get isDisposed(): boolean {
    return nodeIsDisposed(this);
  }

  get isComputed(): boolean {
    return false;
  }

  get isRejected(): boolean {
    return false;
  }

  /**
   * Logic: Execution Lifecycle Orchestration
   * Synchronizes the effect state with its captured dependencies.
   */
  public execute(force = false): void {
    if (!this.#prepareExecution(force)) return;

    this.#execCleanup();

    nodeStartTracking(this);
    prepareTracking(this._storage.deps!);
    const prevDepth = trackingContext.stack.length;

    let val: unknown;
    let hasError = false;
    let errorObj: unknown;

    try {
      try {
        val = runInTrackingContext(trackingContext, this, this.#fn);
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
      this.#handleExecutionError(errorObj);
    } else {
      this.#handleResult(val);
    }

    this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
  }

  #prepareExecution(force: boolean): boolean {
    const flags = this.flags;
    if ((flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) !== 0) return false;

    // Logic: Selective Skipping
    // Execution is skipped if the effect is not 'forced', has no dependencies
    // yet, and its dependencies haven't changed (dirty check). This minimizes
    // redundant computations during the flush cycle.
    if (!(force || this._storage.deps!.slots.length === 0 || nodeIsDirty(this))) return false;

    this.#validateBudget();
    debug.trackUpdate(this.id, debug.getDebugName(this));

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    return true;
  }

  /** Registers a dependency during the tracking session. */
  public addDependency(dep: Dependency): void {
    if (!this.isExecuting) return;
    nodeTrackDependency(this, dep, this.#notifyCallback);
  }

  /**
   * Logic: Resolution Handling
   * Synchronously assigns the cleanup handle or delegates to the async handler.
   */
  #handleResult(val: unknown): void {
    if (typeof val === 'function') {
      this.#cleanup = val as () => void;
    } else if (isPromise(val)) {
      this.#handleAsyncResult(val as Promise<undefined | (() => void)>);
    } else {
      this.#cleanup = null;
    }
  }

  /**
   * Logic: Async Cleanup Tracking
   * Orchestrates cleanup handles returned from Promises. Uses session IDs
   * to discard stale handles from invalidated tracking cycles.
   */
  #handleAsyncResult(promise: Promise<unknown>): void {
    const sessionId = ++this.#trackSessionId;

    promise.then(
      (cleanup) => {
        if (this.#trackSessionId !== sessionId || this.isDisposed) {
          // Logic: Stale or Disposed Teardown
          // If the handle arrived after a new session started, it is invoked
          // immediately and discarded to prevent memory leaks.
          if (typeof cleanup === 'function') {
            try {
              cleanup();
            } catch (e) {
              this.#handleExecutionError(e, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
            }
          }
          return;
        }

        if (typeof cleanup === 'function') this.#cleanup = cleanup as () => void;
      },
      (err) => {
        if (this.#trackSessionId === sessionId) {
          this.#handleExecutionError(err);
        }
      }
    );
  }

  #execCleanup(): void {
    const fn = this.#cleanup;
    if (!fn) return;

    this.#cleanup = null;

    try {
      fn();
    } catch (e) {
      this.#handleExecutionError(e as Error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
    }
  }

  #validateBudget(): void {
    validateEffectBudget(
      this.#budget,
      this.#maxExecutionsPerFlush,
      currentFlushEpoch(),
      incrementFlushExecutionCount,
      (type) => this.#abortExecution(type)
    );

    if (IS_DEV) {
      checkEffectFrequencyLimit(this.#budget, this.#maxExecutions, () => {
        const err = new EffectError(ERROR_MESSAGES.EFFECT_FREQUENCY_LIMIT_EXCEEDED);
        this.dispose();
        this.#handleExecutionError(err);
        throw err;
      });
    }
  }

  /**
   * Logic: Safety Interruption
   * Terminates the effect and signals a terminal failure to prevent
   * system-wide instability from infinite loops.
   */
  #abortExecution(type: 'per-effect' | 'global'): never {
    const message =
      type === 'per-effect'
        ? `Infinite loop detected (per-effect): executed ${this.#budget.loopCount} times in current flush.`
        : 'Infinite loop detected (global): exceeded total execution limit per flush.';

    const error = new EffectError(message);
    this.dispose();
    console.error(error);
    throw error;
  }

  #handleExecutionError(
    error: unknown,
    message: string = ERROR_MESSAGES.EFFECT_EXECUTION_FAILED
  ): void {
    nodeHandleError(this, error, EffectError, message, this.#onError);
  }
}

/**
 * Creates a reactive side-effect that synchronizes state with external systems.
 *
 * When to use:
 * - To update the DOM or integrate with third-party libraries.
 * - To perform logging, monitoring, or diagnostic tasks.
 * - To manage timers, network requests, or global subscriptions.
 *
 * @param fn - The function to execute. Can return a synchronous or asynchronous cleanup handle.
 * @param options - Configuration for execution limits, custom error handlers, and sync delivery.
 * @returns An `EffectObject` used to manually trigger or stop the effect.
 *
 * @throws {EffectError} If the provided `fn` is not a function.
 *
 * @example
 * ```typescript
 * import { atom, effect } from '@but212/atom-effect';
 *
 * const count = atom(0);
 *
 * // Automatically logs whenever 'count' changes
 * const sub = effect(() => {
 *   console.log('Value:', count.value);
 *
 *   // Optional teardown called before the next run or on disposal
 *   return () => console.log('Cleaning up...');
 * });
 *
 * count.value++; // Logs: "Value: 1"
 * sub.dispose(); // Stops the effect
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
