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
  nodeIsDirty,
  nodeStartTracking,
  nodeTrackDependency,
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
import { BUFFER_FLAGS, disposeAll, prepareTracking } from './buffers';
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
  _kind: typeof KIND.Obj = KIND.Obj;
  readonly id: DependencyId = generateId() & SMI_MAX;

  _subscriberSlots: SlotBuffer<SubscriberTarget<void>> | null = null;
  _depSlots: SlotBuffer<DependencyLink> = new SlotBuffer<DependencyLink>();
  _depMap: Map<Dependency, number> | null = null;
  _depFlags: number = BUFFER_FLAGS.NONE;

  /** @internal */
  readonly [BRAND] = BrandFlags.Effect;

  // Logic: Concurrency Control
  // Session IDs ensure that cleanup handles from asynchronous operations are
  // discarded if a new tracking cycle starts before the Promise resolves.
  #trackSessionId = 0;
  #cleanupCallback: (() => void) | null = null;

  #effectCallback: EffectFunction;
  #onErrorCallback: ((error: unknown) => void) | null;
  #notifyCallback: () => void;

  #maxExecutionsPerFlushLimit: number;
  #maxExecutionsPerSecondLimit: number;
  #flushIterationCount = 0;
  #lastFlushEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
  #windowExecutionCount = 0;
  #windowStartTimestampMs = 0;
  #totalExecutionCount = 0;

  constructor(effectCallback: EffectFunction, options: EffectOptions = {}) {
    if (typeof effectCallback !== 'function') {
      throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
    }
    this.#effectCallback = effectCallback;
    this.#onErrorCallback = options.onError ?? null;

    this.#maxExecutionsPerSecondLimit =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this.#maxExecutionsPerFlushLimit =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;

    this.#notifyCallback =
      (options.sync ?? false)
        ? () => {
            const executionResult = this.execute();
            if (Result.isErr(executionResult)) {
              console.error(executionResult.error);
            }
          }
        : () => schedulerSchedule(scheduler, this);

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
    return this.#totalExecutionCount;
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
    const preparationResult = this.#prepareExecution(force);
    if (Result.isErr(preparationResult)) return preparationResult;
    if (!preparationResult.value) return Result.ok(undefined);

    this.#execCleanup();

    nodeStartTracking(this);
    prepareTracking(this);

    try {
      const executionResult = runInTrackingContext(trackingContext, this, this.#effectCallback);
      nodeCommitDeps(this);
      this.#handleResult(executionResult);
    } catch (executionError) {
      this.#handleExecutionError(executionError);
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
    if (!(force || this._depSlots.size === 0 || nodeIsDirty(this))) return Result.ok(false);

    const budgetValidationResult = this.#validateBudget();
    if (Result.isErr(budgetValidationResult)) return budgetValidationResult;
    if (IS_DEV) debug.trackUpdate(this.id, debug.getDebugName(this));

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    return Result.ok(true);
  }

  /** Registers a dependency during the tracking session. */
  addDependency(dependency: Dependency): void {
    if (!this.isExecuting) return;
    nodeTrackDependency(this, dependency, this.#notifyCallback);
  }

  /**
   * Logic: Resolution Handling
   * Synchronously assigns the cleanup handle or delegates to the async handler.
   */
  #handleResult(executionResult: ReturnType<EffectFunction>): void {
    if (executionResult === undefined || executionResult === null) {
      this.#cleanupCallback = null;
      return;
    }

    if (typeof executionResult === 'function') {
      this.#cleanupCallback = executionResult;
    } else if (isPromise(executionResult)) {
      this.#handleAsyncResult(executionResult);
    } else {
      this.#cleanupCallback = null;
    }
  }

  /**
   * Logic: Async Cleanup Tracking
   * Orchestrates cleanup handles returned from Promises. Uses session IDs
   * to discard stale handles from invalidated tracking cycles.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: matches public EffectFunction return type
  #handleAsyncResult(promise: Promise<void | (() => void)>): void {
    const sessionId = ++this.#trackSessionId;

    promise.then(
      (cleanupCallback) => {
        const isStale = this.#trackSessionId !== sessionId || this.isDisposed;
        if (typeof cleanupCallback !== 'function') return;

        if (isStale) {
          // Logic: Stale or Disposed Teardown
          // If the handle arrived after a new session started, it is invoked
          // immediately and discarded to prevent memory leaks.
          try {
            cleanupCallback();
          } catch (e) {
            this.#handleExecutionError(e, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
          }
          return;
        }

        this.#cleanupCallback = cleanupCallback;
      },
      (executionError) => {
        if (this.#trackSessionId === sessionId) {
          this.#handleExecutionError(executionError);
        }
      }
    );
  }

  #execCleanup(): void {
    const cleanupCallback = this.#cleanupCallback;
    if (!cleanupCallback) return;

    this.#cleanupCallback = null;

    try {
      cleanupCallback();
    } catch (cleanupError) {
      this.#handleExecutionError(cleanupError, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
    }
  }

  #validateBudget(): Result<void, Error> {
    const epoch = currentFlushEpoch();
    if (this.#lastFlushEpoch !== epoch) {
      this.#lastFlushEpoch = epoch;
      this.#flushIterationCount = 0;
    }

    if (++this.#flushIterationCount > this.#maxExecutionsPerFlushLimit) {
      const error = new EffectError(
        `Infinite loop detected (per-effect): executed ${this.#flushIterationCount} times in current flush.`
      );
      this.dispose();
      return Result.err(error);
    }

    // Constraint: Global safeguard against aggregate scheduler instability.
    const globalExecutionCountResult = scheduler.incrementFlushExecutionCount();
    if (Result.isErr(globalExecutionCountResult)) {
      this.dispose();
      return globalExecutionCountResult;
    }

    this.#totalExecutionCount++;

    if (IS_DEV) {
      const executionsPerSecondLimit = this.#maxExecutionsPerSecondLimit;
      if (Number.isFinite(executionsPerSecondLimit)) {
        const currentTimestampMs = Date.now();
        if (
          currentTimestampMs - this.#windowStartTimestampMs >=
          DEBUG_CONFIG.EFFECT_FREQUENCY_WINDOW
        ) {
          this.#windowStartTimestampMs = currentTimestampMs;
          this.#windowExecutionCount = 1;
        } else if (++this.#windowExecutionCount > executionsPerSecondLimit) {
          const error = new EffectError(ERROR_MESSAGES.EFFECT_FREQUENCY_LIMIT_EXCEEDED);
          this.dispose();
          this.#handleExecutionError(error);
          return Result.err(error);
        }
      }
    }

    return Result.ok(undefined);
  }

  #handleExecutionError(
    executionError: unknown,
    message: string = ERROR_MESSAGES.EFFECT_EXECUTION_FAILED
  ): void {
    nodeHandleError(this, executionError, EffectError, message, this.#onErrorCallback);
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
 * @param effectCallback - The function to execute. Can return a synchronous or asynchronous cleanup handle.
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
export function effect(effectCallback: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof effectCallback !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }
  const effectInstance = new EffectImpl(effectCallback, options);
  Result.unwrap(effectInstance.execute());
  return effectInstance;
}
