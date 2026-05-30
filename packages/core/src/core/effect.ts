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
import { Result } from '@but212/atom-effect-utils';
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
import { currentFlushEpoch, scheduler, schedulerSchedule } from './scheduler';

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
  readonly maxPerFlush: number;
  readonly maxPerSecond: number;
}

/**
 * Role: Factory for initializing effect budget monitors.
 * @internal
 */
export function createEffectBudgetState(
  maxPerFlush: number,
  maxPerSecond: number
): EffectBudgetState {
  return {
    loopCount: 0,
    lastFlushEpoch: EPOCH_CONSTANTS.UNINITIALIZED,
    windowCount: 0,
    windowStart: 0,
    totalExecutions: 0,
    maxPerFlush,
    maxPerSecond,
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
  currentFlushEpoch: number
): Result<void, Error> {
  if (state.lastFlushEpoch !== currentFlushEpoch) {
    state.lastFlushEpoch = currentFlushEpoch;
    state.loopCount = 0;
  }

  if (++state.loopCount > state.maxPerFlush) {
    const message = ABORT_MESSAGES['per-effect'](state);
    return Result.err(new EffectError(message));
  }

  // Constraint: Global safeguard against aggregate scheduler instability.
  const globalCount = scheduler.incrementFlushExecutionCount();
  if (Result.isErr(globalCount)) {
    return globalCount as unknown as Result<void, Error>;
  }

  state.totalExecutions++;
  return Result.ok(undefined);
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
export function checkEffectFrequencyLimit(state: EffectBudgetState): Result<void, Error> {
  const limit = state.maxPerSecond;
  if (!Number.isFinite(limit)) return Result.ok(undefined);

  const now = Date.now();

  if (now - state.windowStart >= DEBUG_CONFIG.EFFECT_FREQUENCY_WINDOW) {
    state.windowStart = now;
    state.windowCount = 1;
    return Result.ok(undefined);
  }

  if (++state.windowCount > limit) {
    return Result.err(new EffectError(ERROR_MESSAGES.EFFECT_FREQUENCY_LIMIT_EXCEEDED));
  }
  return Result.ok(undefined);
}

const ABORT_MESSAGES = {
  'per-effect': (state: EffectBudgetState) =>
    `Infinite loop detected (per-effect): executed ${state.loopCount} times in current flush.`,
  global: (_state: EffectBudgetState) =>
    'Infinite loop detected (global): exceeded total execution limit per flush.',
} as const;

function validateEffectFunction(fn: unknown): Result<void, Error> {
  if (typeof fn !== 'function') {
    return Result.err(new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION));
  }
  return Result.ok(undefined);
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
  #budget: EffectBudgetState;
  #cleanup: (() => void) | null = null;

  #fn: EffectFunction;
  #onError: ((error: unknown) => void) | null;
  #notifyCallback: () => void;

  #sync: boolean;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    Result.unwrap(validateEffectFunction(fn));
    this.#fn = fn;
    this.#onError = options.onError ?? null;
    this.#sync = options.sync ?? false;

    const maxPerSecond =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    const maxPerFlush = options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;

    this.#budget = createEffectBudgetState(maxPerFlush, maxPerSecond);

    this.#notifyCallback = this.#sync
      ? () => this.execute()
      : () => schedulerSchedule(scheduler, this);

    debug.attachDebugInfo(this, 'effect', this.id, options.name);
  }

  /** Triggers the effect execution immediately. */
  public run(): void {
    if (this.isDisposed) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    }
    Result.unwrap(this.execute(true));
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
    return (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
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
  public execute(force = false): Result<void, Error> {
    const prep = this.#prepareExecution(force);
    if (Result.isErr(prep)) return prep;
    if (!prep.value) return Result.ok(undefined);

    this.#execCleanup();

    const deps = this._storage.deps!;
    nodeStartTracking(this);
    prepareTracking(deps);
    const prevDepth = trackingContext.stack.length;

    try {
      const val = runInTrackingContext(trackingContext, this, this.#fn);
      nodeCommitDeps(this);
      this.#handleResult(val);
    } catch (e) {
      // Impact: Preserves tracking context integrity if the effect crashes.
      rollbackTrackingSubscriber(trackingContext, prevDepth);
      this.#handleExecutionError(e);
    } finally {
      this.flags &= ~EFFECT_STATE_FLAGS.EXECUTING;
    }

    return Result.ok(undefined);
  }

  #prepareExecution(force: boolean): Result<boolean, Error> {
    const flags = this.flags;
    if ((flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) !== 0)
      return Result.ok(false);

    // Logic: Selective Skipping
    // Execution is skipped if the effect is not 'forced', has no dependencies
    // yet, and its dependencies haven't changed (dirty check). This minimizes
    // redundant computations during the flush cycle.
    const deps = this._storage.deps!;
    if (!(force || deps.slots.length === 0 || nodeIsDirty(this))) return Result.ok(false);

    const budgetRes = this.#validateBudget();
    if (Result.isErr(budgetRes)) return budgetRes as unknown as Result<boolean, Error>;
    debug.trackUpdate(this.id, debug.getDebugName(this));

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    return Result.ok(true);
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
    if (val === undefined || val === null) {
      this.#cleanup = null;
      return;
    }

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
        const isStale = this.#trackSessionId !== sessionId || this.isDisposed;
        if (typeof cleanup !== 'function') return;

        if (isStale) {
          // Logic: Stale or Disposed Teardown
          // If the handle arrived after a new session started, it is invoked
          // immediately and discarded to prevent memory leaks.
          try {
            cleanup();
          } catch (e) {
            this.#handleExecutionError(e, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
          }
          return;
        }

        this.#cleanup = cleanup as () => void;
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

  #validateBudget(): Result<void, Error> {
    const budgetRes = validateEffectBudget(this.#budget, currentFlushEpoch());
    if (Result.isErr(budgetRes)) {
      this.dispose();
      console.error(budgetRes.error);
      return budgetRes;
    }

    if (IS_DEV) {
      const freqRes = checkEffectFrequencyLimit(this.#budget);
      if (Result.isErr(freqRes)) {
        const err = freqRes.error;
        this.dispose();
        this.#handleExecutionError(err);
        return freqRes;
      }
    }
    return Result.ok(undefined);
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
function createEffect(
  fn: EffectFunction,
  options: EffectOptions = {}
): Result<EffectObject, Error> {
  const validation = validateEffectFunction(fn);
  if (Result.isErr(validation)) return validation;

  const effectInstance = new EffectImpl(fn, options);
  const execRes = effectInstance.execute();
  if (Result.isErr(execRes)) return execRes as unknown as Result<EffectObject, Error>;

  return Result.ok(effectInstance);
}

export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  return Result.unwrap(createEffect(fn, options));
}
