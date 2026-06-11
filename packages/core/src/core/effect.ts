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

import { Result, SlotBuffer } from '@but212/atom-effect-utils';
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
  nodeStartTracking,
  nodeTrackDependency,
  rollbackTrackingSubscriber,
  runInTrackingContext,
  trackingContext,
} from '@/core/base';
import type {
  Dependency,
  DependencyId,
  DependencyLink,
  DependencyTracker,
  EffectFunction,
  EffectObject,
  EffectOptions,
  ReactiveDependencyTracker,
  ReactiveNode,
  Subscriber,
  SubscriberTarget,
} from '@/types';
import { debug, EffectError, generateId } from '@/utils';
import { isPromise } from '@/utils/type-guards';
import { BUFFER_FLAGS, disposeAll, isBufferDirty, prepareTracking } from './buffers';
import { currentFlushEpoch, scheduler, schedulerSchedule } from './scheduler';

class EffectImpl
  implements
    EffectObject,
    DependencyTracker,
    Subscriber,
    ReactiveNode<void>,
    ReactiveDependencyTracker
{
  // Optimization: Engine-exposed state (JS fields)
  flags: number = 0;
  version: number = 0;
  _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  _nextEpoch: number | undefined = undefined;
  _trackEpoch: number = 0;
  _trackCount: number = 0;
  _error: Error | null = null;
  _k: typeof KIND.Obj = KIND.Obj;
  readonly id: DependencyId = generateId() & SMI_MAX;

  _slots: SlotBuffer<SubscriberTarget<void>> | null = null;
  _depSlots: SlotBuffer<DependencyLink> = new SlotBuffer<DependencyLink>();
  _depMap: Map<Dependency, number> | null = null;
  _depFlags: number = BUFFER_FLAGS.NONE;

  /** @internal */
  readonly [BRAND] = BrandFlags.Effect;

  // Logic: Concurrency Control
  // Session IDs ensure that cleanup handles from asynchronous operations are
  // discarded if a new tracking cycle starts before the Promise resolves.
  #trackSessionId = 0;
  #cleanup: (() => void) | null = null;

  #fn: EffectFunction;
  #onError: ((error: unknown) => void) | null;
  #notifyCallback: () => void;

  #maxPerFlush: number;
  #maxPerSecond: number;
  #loopCount = 0;
  #lastFlushEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
  #windowCount = 0;
  #windowStart = 0;
  #totalExecutions = 0;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    if (typeof fn !== 'function') {
      throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
    }
    this.#fn = fn;
    this.#onError = options.onError ?? null;

    this.#maxPerSecond =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this.#maxPerFlush = options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;

    this.#notifyCallback =
      (options.sync ?? false) ? () => this.execute() : () => schedulerSchedule(scheduler, this);

    if (IS_DEV) debug.attachDebugInfo(this, 'effect', this.id, options.name);
  }

  // ReactiveNode Personality Traits (Declarative Data)
  readonly isComputed = false;
  readonly isRejected = false;

  /** Triggers the effect execution immediately. */
  run(): void {
    if (this.isDisposed) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    }
    Result.unwrap(this.execute(true));
  }

  /**
   * Logic: Final Resource Release
   * Releases all dependencies and executes the current cleanup handle.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;

    this.#execCleanup();
    disposeAll(this);
  }

  /** Total executions since initialization. */
  get executionCount(): number {
    return this.#totalExecutions;
  }

  /** Returns true if the effect is currently executing its function. */
  get isExecuting(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
  }

  /** Returns true if the effect has been permanently stopped. */
  get isDisposed(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }

  /**
   * Logic: Execution Lifecycle Orchestration
   * Synchronizes the effect state with its captured dependencies.
   */
  execute(force = false): Result<void, Error> {
    const prep = this.#prepareExecution(force);
    if (Result.isErr(prep)) return prep;
    if (!prep.value) return Result.ok(undefined);

    this.#execCleanup();

    nodeStartTracking(this);
    prepareTracking(this);
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
    if (!(force || this._depSlots.size === 0 || isBufferDirty(this))) return Result.ok(false);

    const budgetRes = this.#validateBudget();
    if (Result.isErr(budgetRes)) return budgetRes as unknown as Result<boolean, Error>;
    if (IS_DEV) debug.trackUpdate(this.id, debug.getDebugName(this));

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    return Result.ok(true);
  }

  /** Registers a dependency during the tracking session. */
  addDependency(dep: Dependency): void {
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
    const epoch = currentFlushEpoch();
    if (this.#lastFlushEpoch !== epoch) {
      this.#lastFlushEpoch = epoch;
      this.#loopCount = 0;
    }

    if (++this.#loopCount > this.#maxPerFlush) {
      const err = new EffectError(
        `Infinite loop detected (per-effect): executed ${this.#loopCount} times in current flush.`
      );
      this.dispose();
      console.error(err);
      return Result.err(err);
    }

    // Constraint: Global safeguard against aggregate scheduler instability.
    const globalCount = scheduler.incrementFlushExecutionCount();
    if (Result.isErr(globalCount)) {
      this.dispose();
      console.error(globalCount.error);
      return globalCount as unknown as Result<void, Error>;
    }

    this.#totalExecutions++;

    if (IS_DEV) {
      const limit = this.#maxPerSecond;
      if (Number.isFinite(limit)) {
        const now = Date.now();
        if (now - this.#windowStart >= DEBUG_CONFIG.EFFECT_FREQUENCY_WINDOW) {
          this.#windowStart = now;
          this.#windowCount = 1;
        } else if (++this.#windowCount > limit) {
          const err = new EffectError(ERROR_MESSAGES.EFFECT_FREQUENCY_LIMIT_EXCEEDED);
          this.dispose();
          this.#handleExecutionError(err);
          return Result.err(err);
        }
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
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }
  const effectInstance = new EffectImpl(fn, options);
  Result.unwrap(effectInstance.execute());
  return effectInstance;
}
