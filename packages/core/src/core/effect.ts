import {
  COMPUTED_STATE_FLAGS,
  DEBUG_CONFIG,
  EFFECT_STATE_FLAGS,
  EPOCH_CONSTANTS,
  IS_DEV,
  SCHEDULER_CONFIG,
} from '@/constants';
import { ReactiveNode } from '@/core/base';
import { DependencyLink } from '@/core/dep-tracking';
import { EffectError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import { DepSlotBuffer } from '@/internal/dep-slot-buffer';
import {
  currentFlushEpoch,
  flushExecutionCount,
  incrementFlushExecutionCount,
  nextEpoch,
} from '@/internal/epoch';
import { scheduler } from '@/internal/scheduler';
import { EFFECT_BRAND } from '@/symbols';
import { type DependencyTracker, trackingContext } from '@/tracking';
import type { Dependency, EffectFunction, EffectObject, EffectOptions } from '@/types';
import { debug } from '@/utils/debug';
import { wrapError } from '@/utils/error';
import { isPromise } from '@/utils/type-guards';

/**
 * Effect implementation.
 */
class EffectImpl extends ReactiveNode implements EffectObject, DependencyTracker {
  /** @internal */
  readonly [EFFECT_BRAND] = true;

  private _cleanup: (() => void) | null = null;
  private _deps = new DepSlotBuffer();

  /** Pre-allocated notify callback shared by all subscriptions */
  private readonly _notifyCallback: () => void;

  private readonly _onError: ((error: unknown) => void) | null;

  // Cycle detection
  private _currentEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  private _lastFlushEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  private _executionsInEpoch = 0;

  private readonly _fn: EffectFunction;
  private readonly _sync: boolean;
  private readonly _maxExecutions: number;
  private readonly _maxExecutionsPerFlush: number;
  // Frequency tracking (Dev)
  private _executionCount = 0;
  private _windowStart = 0;
  private _windowCount = 0;
  private _execId = 0;
  private _trackCount = 0;

  constructor(fn: EffectFunction, options: EffectOptions = {}) {
    super();
    this._fn = fn;
    this._onError = options.onError ?? null;
    this._sync = options.sync ?? false;
    this._maxExecutions =
      options.maxExecutionsPerSecond ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND;
    this._maxExecutionsPerFlush =
      options.maxExecutionsPerFlush ?? SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT;
    // Pre-allocate callbacks once — eliminates per-dependency closure allocation
    if (this._sync) {
      this._notifyCallback = () => this.execute();
    } else {
      this._notifyCallback = () => scheduler.schedule(this);
    }

    debug.attachDebugInfo(this, 'effect', this.id);
  }

  public run(): void {
    if (this.flags & EFFECT_STATE_FLAGS.DISPOSED) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    }
    this.execute(true);
  }

  public dispose(): void {
    if (this.flags & EFFECT_STATE_FLAGS.DISPOSED) return;
    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;

    this._execCleanup();
    this._deps.disposeAll();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  public addDependency(dep: Dependency): void {
    if (!(this.flags & EFFECT_STATE_FLAGS.EXECUTING)) return;

    const startEpoch = this._currentEpoch;
    if (dep._lastSeenEpoch === startEpoch) return;
    dep._lastSeenEpoch = startEpoch;

    const trackIndex = this._trackCount;
    const existing = this._deps.getAt(trackIndex);

    // 1. Stable Path: dependency index remains the same
    if (existing != null && existing.node === dep) {
      existing.version = dep.version;
      if (dep.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) this._deps.hasComputeds = true;
      this._trackCount = trackIndex + 1;
      return;
    }

    // 2. Diverged Path: lookup or insert
    if (this._deps.claimExisting(dep, trackIndex)) {
      if (dep.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) this._deps.hasComputeds = true;
      this._trackCount = trackIndex + 1;
      return;
    }

    this._insertNewDependency(dep, trackIndex);
  }

  private _insertNewDependency(dep: Dependency, trackIndex: number): void {
    let link: DependencyLink;
    try {
      const unsubscribe = dep.subscribe(this._notifyCallback);
      link = new DependencyLink(dep, dep.version, unsubscribe);
    } catch (error) {
      const wrapped = wrapError(error, EffectError, ERROR_MESSAGES.EFFECT_EXECUTION_FAILED);
      console.error(wrapped);
      if (this._onError) {
        try {
          this._onError(wrapped);
        } catch {}
      }
      link = new DependencyLink(dep, dep.version, undefined);
    }

    if (dep.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) this._deps.hasComputeds = true;
    this._deps.insertNew(trackIndex, link);
    this._trackCount = trackIndex + 1;
  }

  /**
   * Executes effect with tracking.
   */
  public execute(force = false): void {
    if (this.flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) return;

    // Skip if not dirty
    if (!force && this._deps.size > 0 && !this._isDirty()) return;

    this._checkInfiniteLoops();

    this.flags |= EFFECT_STATE_FLAGS.EXECUTING;
    this._execCleanup();

    this._currentEpoch = nextEpoch();
    this._trackCount = 0;
    this._deps.prepareTracking();

    let committed = false;
    try {
      const result = trackingContext.run(this, this._fn);

      // Clean up any remaining trailing dependencies
      this._deps.truncateFrom(this._trackCount);
      this._deps.seal();
      committed = true;

      // Handle result
      if (isPromise(result)) {
        this._handleAsyncResult(result);
      } else {
        this._cleanup = typeof result === 'function' ? result : null;
      }
    } catch (error) {
      // Commit on error gracefully to maintain state for recovery
      if (!committed) {
        try {
          this._deps.truncateFrom(this._trackCount);
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
        // Guard against race conditions (new execution or disposal happened)
        if (execId !== this._execId || this.flags & EFFECT_STATE_FLAGS.DISPOSED) {
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

  private _isDirty(): boolean {
    const deps = this._deps;
    if (!deps.hasComputeds && !deps.isDirtyFast()) return false;

    const prevContext = trackingContext.current;
    trackingContext.current = null;

    try {
      const size = deps.size;
      for (let i = 0; i < size; i++) {
        const link = deps.getAt(i);
        if (link == null) continue;

        const dep = link.node;
        if (dep.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) {
          this._tryPullComputed(dep);
        }

        if (dep.version !== link.version) return true;
      }
      return false;
    } finally {
      trackingContext.current = prevContext;
    }
  }

  private _tryPullComputed(dep: Dependency): void {
    try {
      // Force computed to re-evaluate so version reflects latest state
      void (dep as { value: unknown }).value;
    } catch {
      if (IS_DEV) {
        console.warn(`[atom-effect] Dependency #${dep.id} threw during dirty check`);
      }
    }
  }

  private _execCleanup(): void {
    if (!this._cleanup) return;
    try {
      this._cleanup();
    } catch (error) {
      this._handleExecutionError(error, ERROR_MESSAGES.EFFECT_CLEANUP_FAILED);
    }
    this._cleanup = null;
  }

  private _checkInfiniteLoops(): void {
    const epoch = currentFlushEpoch();
    if (this._lastFlushEpoch !== epoch) {
      this._lastFlushEpoch = epoch;
      this._executionsInEpoch = 0;
    }

    const executions = ++this._executionsInEpoch;
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

  get isDisposed(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.DISPOSED) !== 0;
  }
  get executionCount(): number {
    return this._executionCount;
  }
  get isExecuting(): boolean {
    return (this.flags & EFFECT_STATE_FLAGS.EXECUTING) !== 0;
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
 * Creates and starts an effect.
 *
 * @param fn - Effect function.
 * @param options - Configuration options.
 * @returns Effect instance.
 */
export function effect(fn: EffectFunction, options: EffectOptions = {}): EffectObject {
  if (typeof fn !== 'function') {
    throw new EffectError(ERROR_MESSAGES.EFFECT_MUST_BE_FUNCTION);
  }

  const effectInstance = new EffectImpl(fn, options);
  effectInstance.execute();

  return effectInstance;
}
