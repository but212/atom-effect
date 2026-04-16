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
 * Effect implementation.
 */
class EffectImpl extends ReactiveNode<void> implements EffectObject, DependencyTracker {
  /** @internal */
  readonly [BRAND] = BrandFlags.Effect;

  // Bookkeeping fields grouped at top for V8 layout optimization
  private _currentEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  private _lastFlushEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  private _executionsInEpoch = 0;
  private _executionCount = 0;
  private _windowStart = 0;
  private _windowCount = 0;
  private _execId = 0;
  private _trackCount = 0;

  private _cleanup: (() => void) | null = null;
  /** Initialized in constructor to maintain God Class object shape */
  _deps = new DepSlotBuffer();

  /** Pre-allocated notify callback shared by all subscriptions */
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

    // Pre-allocate callbacks once — eliminates per-dependency closure allocation
    if (this._sync) {
      this._notifyCallback = () => this.execute();
    } else {
      this._notifyCallback = () => scheduler.schedule(this);
    }

    debug.attachDebugInfo(this, 'effect', this.id, options.name);
  }

  public run(): void {
    if (this.isDisposed) {
      throw new EffectError(ERROR_MESSAGES.EFFECT_DISPOSED);
    }
    this.execute(true);
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.flags |= EFFECT_STATE_FLAGS.DISPOSED;

    this._execCleanup();
    this._deps?.disposeAll();
  }

  // [Symbol.dispose](): void {
  //   this.dispose();
  // }

  public addDependency(dep: Dependency): void {
    if ((this.flags & EFFECT_STATE_FLAGS.EXECUTING) === 0) return;

    if (dep._lastSeenEpoch === this._currentEpoch) return;
    dep._lastSeenEpoch = this._currentEpoch;

    const trackIndex = this._trackCount++;
    const deps = this._deps;
    const version = dep.version;

    // [Optimization] Fast-path lookup bypassing SlotBuffer.getAt() or switch statements
    let existing: DependencyLink | null = null;
    if (trackIndex < 4) {
      if (trackIndex === 0) existing = deps._s0;
      else if (trackIndex === 1) existing = deps._s1;
      else if (trackIndex === 2) existing = deps._s2;
      else existing = deps._s3;
    } else {
      const ov = deps._overflow;
      if (ov !== null) existing = ov[trackIndex - 4] ?? null;
    }

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
        } catch {}
      }
      link = new DependencyLink(dep, version, undefined);
    }

    this._deps.insertNew(trackIndex, link);
  }

  /**
   * Executes effect with tracking.
   */
  public execute(force = false): void {
    const flags = this.flags;
    // Guard: Combined bitwise check for efficiency
    if ((flags & (EFFECT_STATE_FLAGS.DISPOSED | EFFECT_STATE_FLAGS.EXECUTING)) !== 0) return;

    // Skip if not dirty or forced
    const deps = this._deps;
    if (!force && deps.physicalSize > 0 && !this._isDirty()) return;

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

      // Clean up any remaining trailing dependencies
      deps.truncateFrom(this._trackCount);
      committed = true;

      // Handle result
      if (typeof result === 'function') {
        this._cleanup = result as () => void;
      } else if (isPromise(result)) {
        this._handleAsyncResult(result);
      } else {
        this._cleanup = null;
      }
    } catch (error) {
      // Commit on error gracefully to maintain state for recovery
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
    const size = deps.size;
    if (size === 0) return false;

    // Fast path: Check hot index first without switching context
    const hotIndex = this._hotIndex;
    if (hotIndex !== -1 && hotIndex < size) {
      const link = deps.getAt(hotIndex);
      if (link !== null) {
        const dep = link.node;
        // Correctness: Only non-computed deps can skip context switch/deep check
        if (!dep.isComputed && dep.version !== link.version) return true;
      }
    }

    return this._deepDirtyCheck();
  }

  protected override _deepDirtyCheck(): boolean {
    const deps = this._deps;
    const size = deps.size;
    const hotIdx = this._hotIndex;

    const prevContext = trackingContext.current;
    trackingContext.current = null;

    try {
      // Priority 1: Check others with hotIdx skip
      for (let i = 0; i < size; i++) {
        if (i === hotIdx) continue;
        const link = deps.getAt(i);
        if (link === null) continue;

        const dep = link.node;
        if (dep.isComputed) {
          try {
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
