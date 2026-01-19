import {
  AsyncState,
  COMPUTED_STATE_FLAGS,
  EMPTY_ERROR_ARRAY,
  PHASE_THRESHOLD,
  SMI_MAX,
} from '@/constants';
import { ReactiveDependency } from '@/core/base/reactive-dependency';
import { syncDependencies, trackDependency } from '@/core/utils/dep-tracking';
import type { AtomError } from '@/errors/errors';
import { ComputedError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import { currentEpoch, nextEpoch } from '@/internal/epoch';
import {
  depArrayPool,
  EMPTY_DEPS,
  EMPTY_UNSUBS,
  EMPTY_VERSIONS,
  unsubArrayPool,
  versionArrayPool,
} from '@/internal/pool';
import { trackingContext } from '@/tracking';

import type {
  AsyncStateType,
  ComputationContext,
  ComputedAtom,
  ComputedOptions,
  Dependency,
  Subscriber,
} from '@/types';
import { debug, NO_DEFAULT_VALUE } from '@/utils/debug';
import { wrapError } from '@/utils/error';
import { SubscriberManager } from '@/utils/subscriber-manager';
import { isPromise } from '@/utils/type-guards';

// AsyncState mapping
const ASYNC_STATE_MASK =
  COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.PENDING | COMPUTED_STATE_FLAGS.REJECTED;
const ASYNC_STATE_LOOKUP = Array(ASYNC_STATE_MASK + 1).fill(AsyncState.IDLE);
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.RESOLVED] = AsyncState.RESOLVED;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.PENDING] = AsyncState.PENDING;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.REJECTED] = AsyncState.REJECTED;

type TrackableListener = (() => void) & {
  addDependency: (dep: Dependency) => void;
};

/**
 * Computed atom with lazy evaluation, caching, and async support.
 * Uses bit flags for state and epoch-based dependency deduplication.
 */
class ComputedAtomImpl<T> extends ReactiveDependency<T> implements ComputedAtom<T>, Subscriber {
  private _value: T;
  private _error: AtomError | null;
  private _promiseId: number;
  private readonly _equal: (a: T, b: T) => boolean;

  private readonly _fn: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _hasDefaultValue: boolean;
  private readonly _onError: ((error: Error) => void) | null;
  private readonly _functionSubscribersStore: SubscriberManager<
    (newValue?: T, oldValue?: T) => void
  >;
  private readonly _objectSubscribersStore: SubscriberManager<Subscriber>;
  private _dependencies: Dependency[];
  private _dependencyVersions: number[];
  private _unsubscribes: (() => void)[];

  // Error propagation fields
  private _cachedErrors: readonly Error[] | null = null;
  private _errorCacheEpoch = -1;

  // Async phase drift validation fields
  private _asyncStartAggregateVersion: number = 0;
  private _asyncRetryCount: number = 0;
  private readonly MAX_ASYNC_RETRIES: number = 3;

  private readonly _notifyJob: () => void;
  private readonly _trackable: TrackableListener;
  private readonly MAX_PROMISE_ID: number;

  constructor(fn: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof fn !== 'function') {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    }

    super();

    this._value = undefined as T;
    this.flags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;

    this._error = null;
    this._promiseId = 0;
    this._equal = options.equal ?? Object.is;

    this._fn = fn;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._hasDefaultValue = this._defaultValue !== (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;
    this.MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

    this._functionSubscribersStore = new SubscriberManager<(newValue?: T, oldValue?: T) => void>();
    this._objectSubscribersStore = new SubscriberManager<Subscriber>();

    this._dependencies = EMPTY_DEPS;
    this._dependencyVersions = EMPTY_VERSIONS;
    this._unsubscribes = EMPTY_UNSUBS;

    this._notifyJob = () => {
      this._functionSubscribersStore.forEachSafe(
        (subscriber) => subscriber(),
        (err) => console.error(err)
      );

      this._objectSubscribersStore.forEachSafe(
        (subscriber) => subscriber.execute(),
        (err) => console.error(err)
      );
    };

    this._trackable = Object.assign(() => this._markDirty(), {
      addDependency: (_dep: Dependency) => {},
    });

    debug.attachDebugInfo(this as unknown as ComputedAtom<T>, 'computed', this.id);

    if (debug.enabled) {
      const debugObj = this as unknown as ComputedAtom<T> & {
        subscriberCount: () => number;
        isDirty: () => boolean;
        dependencies: Dependency[];
        stateFlags: string;
      };
      debugObj.subscriberCount = () =>
        this._functionSubscribersStore.size + this._objectSubscribersStore.size;
      debugObj.isDirty = () => this._isDirty();
      debugObj.dependencies = this._dependencies;
      debugObj.stateFlags = this._getFlagsAsString();
    }

    if (options.lazy === false) {
      try {
        this._recompute();
      } catch {
        // Ignore initial computation failure
      }
    }
  }

  protected get _functionSubscribers(): SubscriberManager<(newValue?: T, oldValue?: T) => void> {
    return this._functionSubscribersStore;
  }

  protected get _objectSubscribers(): SubscriberManager<Subscriber> {
    return this._objectSubscribersStore;
  }

  get value(): T {
    // Register tracking FIRST so this computed becomes a dependency
    // even if _computeValue throws. This is critical for error propagation.
    this._registerTracking();
    const result = this._computeValue();
    return result;
  }

  peek(): T {
    return this._value;
  }

  get state(): AsyncStateType {
    this._registerTracking();
    return this._getAsyncState();
  }

  get hasError(): boolean {
    this._registerTracking();

    // 1. Check own error state
    if (this._isRejected()) {
      return true;
    }

    // 2. Check dependency errors (early return)
    for (let i = 0; i < this._dependencies.length; i++) {
      const dep = this._dependencies[i];
      if (dep && 'hasError' in dep && (dep as unknown as ComputedAtom<unknown>).hasError) {
        return true;
      }
    }

    return false;
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    this._registerTracking();

    // Fast path: no errors
    if (!this.hasError) {
      return EMPTY_ERROR_ARRAY;
    }

    // Check epoch cache
    const epoch = currentEpoch();
    if (this._errorCacheEpoch === epoch && this._cachedErrors !== null) {
      return this._cachedErrors;
    }

    // Collect errors (lazy) using Set for deduplication
    const errorSet = new Set<Error>();

    // Own error
    if (this._error) {
      errorSet.add(this._error);
    }

    // Dependency errors (recursive collection, deduplicated)
    for (let i = 0; i < this._dependencies.length; i++) {
      const dep = this._dependencies[i];
      if (dep && 'errors' in dep) {
        const depErrors = (dep as unknown as ComputedAtom<unknown>).errors;
        for (let j = 0; j < depErrors.length; j++) {
          const err = depErrors[j];
          if (err) {
            errorSet.add(err);
          }
        }
      }
    }

    // Cache and freeze
    this._cachedErrors = Object.freeze([...errorSet]);
    this._errorCacheEpoch = epoch;

    return this._cachedErrors;
  }

  get lastError(): Error | null {
    this._registerTracking();
    return this._error;
  }

  get isPending(): boolean {
    this._registerTracking();
    return this._isPending();
  }

  get isResolved(): boolean {
    this._registerTracking();
    return this._isResolved();
  }

  invalidate(): void {
    this._markDirty();
    if (this._dependencyVersions !== EMPTY_VERSIONS) {
      versionArrayPool.release(this._dependencyVersions);
      this._dependencyVersions = EMPTY_VERSIONS;
    }
    // Invalidate error cache
    this._errorCacheEpoch = -1;
    this._cachedErrors = null;
  }

  dispose(): void {
    if (this._unsubscribes !== EMPTY_UNSUBS) {
      for (let i = 0; i < this._unsubscribes.length; i++) {
        const unsub = this._unsubscribes[i];
        if (unsub) unsub();
      }
      unsubArrayPool.release(this._unsubscribes);
      this._unsubscribes = EMPTY_UNSUBS;
    }

    if (this._dependencies !== EMPTY_DEPS) {
      depArrayPool.release(this._dependencies);
      this._dependencies = EMPTY_DEPS;
    }

    if (this._dependencyVersions !== EMPTY_VERSIONS) {
      versionArrayPool.release(this._dependencyVersions);
      this._dependencyVersions = EMPTY_VERSIONS;
    }

    this._functionSubscribersStore.clear();
    this._objectSubscribersStore.clear();
    this.flags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
    this._error = null;
    this._value = undefined as T;
    this._promiseId = (this._promiseId + 1) % this.MAX_PROMISE_ID;
    // Clear error cache
    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
  }

  // State flag operations
  private _isDirty(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;
  }

  private _setDirty(): void {
    this.flags |= COMPUTED_STATE_FLAGS.DIRTY;
  }

  private _clearDirty(): void {
    this.flags &= ~COMPUTED_STATE_FLAGS.DIRTY;
  }

  private _isIdle(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.IDLE) !== 0;
  }

  private _setIdle(): void {
    this.flags |= COMPUTED_STATE_FLAGS.IDLE;
    this.flags &= ~(
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.REJECTED
    );
  }

  private _isPending(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.PENDING) !== 0;
  }

  private _setPending(): void {
    this.flags |= COMPUTED_STATE_FLAGS.PENDING;
    this.flags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.REJECTED
    );
  }

  private _isResolved(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0;
  }

  private _setResolved(): void {
    this.flags |= COMPUTED_STATE_FLAGS.RESOLVED;
    this.flags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.REJECTED |
      COMPUTED_STATE_FLAGS.HAS_ERROR
    );
  }

  private _isRejected(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.REJECTED) !== 0;
  }

  private _setRejected(): void {
    this.flags |= COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR;
    this.flags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.RESOLVED
    );
  }

  private _isRecomputing(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0;
  }

  private _setRecomputing(value: boolean): void {
    const mask = COMPUTED_STATE_FLAGS.RECOMPUTING;
    this.flags = (this.flags & ~mask) | (-Number(value) & mask);
  }

  private _getAsyncState(): AsyncStateType {
    return ASYNC_STATE_LOOKUP[this.flags & ASYNC_STATE_MASK];
  }

  private _getFlagsAsString(): string {
    const states: string[] = [];
    if (this._isDirty()) states.push('DIRTY');
    if (this._isIdle()) states.push('IDLE');
    if (this._isPending()) states.push('PENDING');
    if (this._isResolved()) states.push('RESOLVED');
    if (this._isRejected()) states.push('REJECTED');
    if (this._isRecomputing()) states.push('RECOMPUTING');
    return states.join(' | ');
  }

  private _computeValue(): T {
    if (this._isRecomputing()) return this._value;

    if (this._isDirty() || this._isIdle()) {
      this._recompute();
    }

    if (this._isPending()) return this._handlePending();
    if (this._isRejected()) return this._handleRejected();

    return this._value;
  }

  private _recompute(): void {
    if (this._isRecomputing()) return;

    this._setRecomputing(true);

    const context = this._prepareComputationContext();
    let committed = false;

    try {
      const result = trackingContext.run(this._trackable, this._fn);

      this._commitDependencies(context);
      committed = true;

      isPromise(result) ? this._handleAsyncComputation(result) : this._handleSyncResult(result);
    } catch (err) {
      if (!committed) {
        try {
          this._commitDependencies(context);
          committed = true;
        } catch (commitErr) {
          this._handleComputationError(commitErr);
        }
      }
      this._handleComputationError(err);
    } finally {
      this._cleanupContext(context, committed);
      this._setRecomputing(false);
    }
  }

  private _prepareComputationContext(): ComputationContext {
    const prevDeps = this._dependencies;
    const prevVersions = this._dependencyVersions;
    const nextDeps = depArrayPool.acquire();
    const nextVersions = versionArrayPool.acquire();
    const epoch = nextEpoch();
    const state = { depCount: 0 };

    const collect = (dep: Dependency) => {
      if (dep._lastSeenEpoch === epoch) return;
      dep._lastSeenEpoch = epoch;

      if (state.depCount < nextDeps.length) {
        nextDeps[state.depCount] = dep;
        nextVersions[state.depCount] = dep.version;
      } else {
        nextDeps.push(dep);
        nextVersions.push(dep.version);
      }
      state.depCount++;
    };

    const originalAdd = this._trackable.addDependency;
    this._trackable.addDependency = collect;

    return { prevDeps, prevVersions, nextDeps, nextVersions, originalAdd, state };
  }

  private _commitDependencies(ctx: ComputationContext): void {
    const { nextDeps, nextVersions, state, prevDeps } = ctx;

    nextDeps.length = state.depCount;
    nextVersions.length = state.depCount;

    this._unsubscribes = syncDependencies(nextDeps, prevDeps, this._unsubscribes, this);
    this._dependencies = nextDeps;
    this._dependencyVersions = nextVersions;
  }

  private _cleanupContext(ctx: ComputationContext, committed: boolean): void {
    this._trackable.addDependency = ctx.originalAdd;

    if (committed) {
      if (ctx.prevDeps !== EMPTY_DEPS) {
        depArrayPool.release(ctx.prevDeps);
      }
      if (ctx.prevVersions !== EMPTY_VERSIONS) {
        versionArrayPool.release(ctx.prevVersions);
      }
    } else {
      depArrayPool.release(ctx.nextDeps);
      versionArrayPool.release(ctx.nextVersions);
    }
  }

  /**
   * Calculates aggregate shift from all dependencies.
   * Used for scheduling priority in computed chains.
   *
   * Performance: O(N) where N = dependency count
   * Branchless: Each dep.getShift uses modular arithmetic
   *
   * @returns Sum of all dependency shifts (capped at SMI_MAX)
   */
  private _getAggregateShift(): number {
    let totalShift = 0;
    const deps = this._dependencies;
    const versions = this._dependencyVersions;

    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i];
      const cachedVersion = versions[i];
      if (dep && cachedVersion !== undefined) {
        // getShift uses branchless modular arithmetic
        totalShift = (totalShift + dep.getShift(cachedVersion)) & SMI_MAX;
      }
    }

    return totalShift;
  }

  /**
   * Checks if this computed should be scheduled with urgent priority.
   * Based on aggregate shift from all dependencies.
   *
   * @returns true if aggregate shift exceeds PHASE_THRESHOLD
   */
  isUrgent(): boolean {
    return this._getAggregateShift() >= PHASE_THRESHOLD;
  }

  private _handleSyncResult(result: T): void {
    this._finalizeResolution(result);
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    this._setPending();
    this._clearDirty();
    this._notifyJob();

    // Capture version snapshot at async start for drift validation
    this._asyncStartAggregateVersion = this._captureVersionSnapshot();
    this._asyncRetryCount = 0;

    this._promiseId = this._promiseId >= this.MAX_PROMISE_ID ? 1 : this._promiseId + 1;
    const promiseId = this._promiseId;

    promise
      .then((resolvedValue) => {
        if (promiseId !== this._promiseId) return;

        // Phase drift validation: check if dependencies changed significantly during async
        const currentAggregate = this._captureVersionSnapshot();
        const drift = (currentAggregate - this._asyncStartAggregateVersion) & SMI_MAX;

        // Branchless stale detection: 1 if drift >= PHASE_THRESHOLD, else 0
        const isStale = ((PHASE_THRESHOLD - 1 - drift) >>> 31) & 1;

        // If stale, handle retry or fail-fast
        if (isStale) {
          if (this._asyncRetryCount < this.MAX_ASYNC_RETRIES) {
            // Retry: trigger recomputation with fresh dependencies
            this._asyncRetryCount++;
            this._markDirty();
            return;
          }

          // Fail-Fast Policy: retries exhausted, reject with descriptive error
          // This allows UI layer to gracefully degrade using hasError/defaultValue
          const error = new ComputedError(
            `Async drift exceeded threshold after ${this.MAX_ASYNC_RETRIES} retries. Dependencies changed too rapidly for stable computation.`
          );
          this._handleAsyncRejection(error);
          return;
        }

        this._handleAsyncResolution(resolvedValue);
      })
      .catch((err) => {
        if (promiseId !== this._promiseId) return;
        this._handleAsyncRejection(err);
      });
  }

  /**
   * Captures the aggregate version of all dependencies.
   * Used for phase drift validation in async computations.
   *
   * @returns Sum of all dependency versions (capped at SMI_MAX)
   */
  private _captureVersionSnapshot(): number {
    let aggregate = 0;
    const deps = this._dependencies;
    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i];
      if (dep) {
        aggregate = (aggregate + dep.version) & SMI_MAX;
      }
    }
    return aggregate;
  }

  private _handleAsyncResolution(resolvedValue: T): void {
    this._finalizeResolution(resolvedValue);
    this._notifyJob();
  }

  /**
   * Unified success finalization for sync and async results.
   * Handles phase rotation, state transition, and error cache clearing.
   */
  private _finalizeResolution(value: T): void {
    const valueChanged = !this._isResolved() || !this._equal(this._value, value);

    // Conditional phase rotation: only rotate if value actually changed
    if (valueChanged) this.rotatePhase();

    this._value = value;
    this._clearDirty();
    this._setResolved();
    this._error = null;
    this._setRecomputing(false);

    // Clear error cache on successful computation (recovery)
    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
  }

  private _handleAsyncRejection(err: unknown): void {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);

    // Rotate phase so effects detect the state change (pending -> rejected)
    const stateChanged = !this._isRejected();
    if (stateChanged) this.rotatePhase();

    this._error = error;
    this._setRejected();
    this._clearDirty();
    this._setRecomputing(false);

    if (this._onError) {
      try {
        this._onError(error);
      } catch (callbackError) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, callbackError);
      }
    }

    this._notifyJob();
  }

  private _handleComputationError(err: unknown): never {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED);

    this._error = error;
    this._setRejected();
    this._clearDirty();
    this._setRecomputing(false);

    if (this._onError) {
      try {
        this._onError(error);
      } catch (callbackError) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, callbackError);
      }
    }

    throw error;
  }

  private _handlePending(): T {
    if (this._hasDefaultValue) {
      return this._defaultValue;
    }
    throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
  }

  private _handleRejected(): T {
    if (this._error?.recoverable && this._hasDefaultValue) {
      return this._defaultValue;
    }
    throw this._error;
  }

  /** Subscriber interface - marks dirty on dependency change */
  execute(): void {
    this._markDirty();
  }

  private _markDirty(): void {
    if (this._isRecomputing() || this._isDirty()) return;

    this._setDirty();
    this._notifyJob();
  }

  private _registerTracking(): void {
    trackDependency(
      this,
      trackingContext.getCurrent(),
      this._functionSubscribersStore,
      this._objectSubscribersStore
    );
  }
}

Object.freeze(ComputedAtomImpl.prototype);

/**
 * Creates a computed value with automatic dependency tracking.
 * Supports sync/async computations with caching and lazy evaluation.
 * @param fn - Computation function (sync or async)
 * @param options - { equal?, defaultValue?, onError?, lazy? }
 */
export function computed<T>(fn: () => T, options?: ComputedOptions<T>): ComputedAtom<T>;
export function computed<T>(
  fn: () => Promise<T>,
  options: ComputedOptions<T> & { defaultValue: T }
): ComputedAtom<T>;
export function computed<T>(
  fn: () => T | Promise<T>,
  options: ComputedOptions<T> = {}
): ComputedAtom<T> {
  return new ComputedAtomImpl(fn, options) as unknown as ComputedAtom<T>;
}
