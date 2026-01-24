import {
  AsyncState,
  COMPUTED_STATE_FLAGS,
  EMPTY_ERROR_ARRAY,
  PHASE_THRESHOLD,
  SMI_MAX,
} from '@/constants';
import { ReactiveDependency } from '@/core/base';
import { syncDependencies, trackDependency } from '@/core/dep-tracking';
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
  ComputedAtom,
  ComputedOptions,
  Dependency,
  Subscriber,
} from '@/types';
import { debug, NO_DEFAULT_VALUE } from '@/utils/debug';
import { wrapError } from '@/utils/error';
import { isPromise } from '@/utils/type-guards';

// AsyncState mapping
const ASYNC_STATE_MASK =
  COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.PENDING | COMPUTED_STATE_FLAGS.REJECTED;
const ASYNC_STATE_LOOKUP = Array(ASYNC_STATE_MASK + 1).fill(AsyncState.IDLE);
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.RESOLVED] = AsyncState.RESOLVED;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.PENDING] = AsyncState.PENDING;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.REJECTED] = AsyncState.REJECTED;

/**
 * Internal helper for stable Hidden Class in V8
 * @internal
 */
class ComputedTrackable<T> implements Subscriber {
  _epoch: number;
  _nextDeps: Dependency[];
  _nextVersions: number[];
  _depCount: number;

  constructor(private readonly _owner: ComputedAtomImpl<T>) {
    this._epoch = -1;
    this._nextDeps = EMPTY_DEPS;
    this._nextVersions = EMPTY_VERSIONS;
    this._depCount = 0;
  }

  execute(): void {
    this._owner._markDirty();
  }

  addDependency(dep: Dependency): void {
    if (dep._lastSeenEpoch === this._epoch) {
      return;
    }
    dep._lastSeenEpoch = this._epoch;

    const count = this._depCount;
    const deps = this._nextDeps;
    const versions = this._nextVersions;

    if (count < deps.length) {
      deps[count] = dep;
      versions[count] = dep.version;
    } else {
      deps.push(dep);
      versions.push(dep.version);
    }
    this._depCount = count + 1;
  }

  reset(): void {
    this._epoch = -1;
    this._nextDeps = EMPTY_DEPS;
    this._nextVersions = EMPTY_VERSIONS;
    this._depCount = 0;
  }
}

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

  protected _fnSubs: ((newValue?: T, oldValue?: T) => void)[];
  protected _objSubs: Subscriber[];

  private _dependencies: Dependency[];
  private _dependencyVersions: number[];
  private _unsubscribes: (() => void)[];

  // Error propagation fields
  private _cachedErrors: readonly Error[] | null;
  private _errorCacheEpoch: number;

  // Async phase drift validation fields
  private _asyncStartAggregateVersion: number;
  private _asyncRetryCount: number;
  private readonly MAX_ASYNC_RETRIES: number = 3;

  private readonly _trackable: ComputedTrackable<T>;
  private readonly MAX_PROMISE_ID: number;

  constructor(fn: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof fn !== 'function') {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    }

    super();

    // V8 Hidden Class Stability: Group property initializations
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

    this._fnSubs = [];
    this._objSubs = [];
    this._dependencies = EMPTY_DEPS;
    this._dependencyVersions = EMPTY_VERSIONS;
    this._unsubscribes = EMPTY_UNSUBS;

    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
    this._asyncStartAggregateVersion = 0;
    this._asyncRetryCount = 0;

    this._trackable = new ComputedTrackable(this);

    debug.attachDebugInfo(this as unknown as ComputedAtom<T>, 'computed', this.id);

    if (debug.enabled) {
      const debugObj = this as unknown as ComputedAtom<T> & {
        subscriberCount: () => number;
        isDirty: () => boolean;
        dependencies: Dependency[];
        stateFlags: string;
      };
      debugObj.subscriberCount = this.subscriberCount.bind(this);
      debugObj.isDirty = () => (this.flags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;
      debugObj.dependencies = this._dependencies;
      debugObj.stateFlags = ''; // Settable via getter logic if needed
    }

    if (options.lazy === false) {
      try {
        this._recompute();
      } catch {
        // Ignore initial computation failure
      }
    }
  }

  get value(): T {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._fnSubs, this._objSubs);

    const flags = this.flags;
    if (flags & COMPUTED_STATE_FLAGS.RECOMPUTING) {
      // Circular dependency detected: computation is accessing itself during recompute.
      // Return default value if available, otherwise throw.
      if (this._hasDefaultValue) return this._defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }
    if (flags & (COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE)) this._recompute();

    const currentFlags = this.flags;
    if (currentFlags & COMPUTED_STATE_FLAGS.PENDING) return this._handlePending();
    if (currentFlags & COMPUTED_STATE_FLAGS.REJECTED) return this._handleRejected();

    return this._value;
  }

  peek(): T {
    return this._value;
  }

  get state(): AsyncStateType {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._fnSubs, this._objSubs);
    return ASYNC_STATE_LOOKUP[this.flags & ASYNC_STATE_MASK];
  }

  get hasError(): boolean {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._fnSubs, this._objSubs);

    const flags = this.flags;
    if (flags & (COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR)) return true;

    const deps = this._dependencies;
    for (let i = 0, len = deps.length; i < len; i++) {
      const dep = deps[i];
      if (dep && dep.flags & COMPUTED_STATE_FLAGS.HAS_ERROR) return true;
    }
    return false;
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._fnSubs, this._objSubs);

    if (!this.hasError) return EMPTY_ERROR_ARRAY;

    const epoch = currentEpoch();
    if (this._errorCacheEpoch === epoch && this._cachedErrors !== null) {
      return this._cachedErrors;
    }

    const errorSet = new Set<Error>();
    if (this._error) errorSet.add(this._error);

    const deps = this._dependencies;
    for (let i = 0, len = deps.length; i < len; i++) {
      const dep = deps[i];
      if (dep && 'errors' in dep) {
        const depErrors = (dep as unknown as ComputedAtom<unknown>).errors;
        for (let j = 0, jLen = depErrors.length; j < jLen; j++) {
          const err = depErrors[j];
          if (err) errorSet.add(err);
        }
      }
    }

    const result = Object.freeze([...errorSet]);
    this._cachedErrors = result;
    this._errorCacheEpoch = epoch;
    return result;
  }

  get lastError(): Error | null {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._fnSubs, this._objSubs);
    return this._error;
  }

  get isPending(): boolean {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._fnSubs, this._objSubs);
    return (this.flags & COMPUTED_STATE_FLAGS.PENDING) !== 0;
  }

  get isResolved(): boolean {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._fnSubs, this._objSubs);
    return (this.flags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0;
  }

  invalidate(): void {
    this._markDirty();
    const versions = this._dependencyVersions;
    if (versions !== EMPTY_VERSIONS) {
      versionArrayPool.release(versions);
      this._dependencyVersions = EMPTY_VERSIONS;
    }
    this._errorCacheEpoch = -1;
    this._cachedErrors = null;
  }

  dispose(): void {
    const unsubs = this._unsubscribes;
    if (unsubs !== EMPTY_UNSUBS) {
      for (let i = 0, len = unsubs.length; i < len; i++) {
        const unsub = unsubs[i];
        if (unsub) unsub();
      }
      unsubArrayPool.release(unsubs);
      this._unsubscribes = EMPTY_UNSUBS;
    }

    const deps = this._dependencies;
    if (deps !== EMPTY_DEPS) {
      depArrayPool.release(deps);
      this._dependencies = EMPTY_DEPS;
    }

    const versions = this._dependencyVersions;
    if (versions !== EMPTY_VERSIONS) {
      versionArrayPool.release(versions);
      this._dependencyVersions = EMPTY_VERSIONS;
    }

    this._fnSubs = [];
    this._objSubs = [];
    this.flags =
      COMPUTED_STATE_FLAGS.DISPOSED | COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
    this._error = null;
    this._value = undefined as T;
    this._promiseId = (this._promiseId + 1) % this.MAX_PROMISE_ID;
    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
  }

  private _clearDirty(): void {
    this.flags &= ~COMPUTED_STATE_FLAGS.DIRTY;
  }

  private _setPending(): void {
    this.flags =
      (this.flags | COMPUTED_STATE_FLAGS.PENDING) &
      ~(COMPUTED_STATE_FLAGS.IDLE | COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.REJECTED);
  }

  private _isResolved(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0;
  }

  private _setResolved(): void {
    this.flags =
      (this.flags | COMPUTED_STATE_FLAGS.RESOLVED) &
      ~(
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
    const mask =
      COMPUTED_STATE_FLAGS.IDLE | COMPUTED_STATE_FLAGS.PENDING | COMPUTED_STATE_FLAGS.RESOLVED;
    this.flags =
      (this.flags & ~mask) | (COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR);
  }

  private _setRecomputing(value: boolean): void {
    const mask = COMPUTED_STATE_FLAGS.RECOMPUTING;
    this.flags = (this.flags & ~mask) | ((value ? -1 : 0) & mask);
  }

  private _recompute(): void {
    if (this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) {
      return;
    }

    this._setRecomputing(true);

    const trackable = this._trackable;
    const prevDeps = this._dependencies;
    const prevVersions = this._dependencyVersions;

    trackable._epoch = nextEpoch();
    trackable._nextDeps = depArrayPool.acquire();
    trackable._nextVersions = versionArrayPool.acquire();
    trackable._depCount = 0;

    let committed = false;

    try {
      const result = trackingContext.run(trackable, this._fn);

      // Commit Dependencies
      const nextDeps = trackable._nextDeps;
      const nextVersions = trackable._nextVersions;
      const depCount = trackable._depCount;

      nextDeps.length = depCount;
      nextVersions.length = depCount;

      this._unsubscribes = syncDependencies(nextDeps, prevDeps, this._unsubscribes, this);
      this._dependencies = nextDeps;
      this._dependencyVersions = nextVersions;
      committed = true;

      if (isPromise(result)) {
        this._handleAsyncComputation(result);
      } else {
        this._finalizeResolution(result);
      }
    } catch (e) {
      let err = e as Error;
      if (!committed) {
        // Fallback commit for partial success/circular detection
        try {
          const nextDeps = trackable._nextDeps;
          const nextVersions = trackable._nextVersions;
          const depCount = trackable._depCount;
          nextDeps.length = depCount;
          nextVersions.length = depCount;
          this._unsubscribes = syncDependencies(nextDeps, prevDeps, this._unsubscribes, this);
          this._dependencies = nextDeps;
          this._dependencyVersions = nextVersions;
          committed = true;
        } catch (commitErr) {
          err = commitErr as Error;
        }
      }
      this._handleComputationError(err);
    } finally {
      // Cleanup Trackable
      if (committed) {
        if (prevDeps !== EMPTY_DEPS) depArrayPool.release(prevDeps);
        if (prevVersions !== EMPTY_VERSIONS) versionArrayPool.release(prevVersions);
      } else {
        depArrayPool.release(trackable._nextDeps);
        versionArrayPool.release(trackable._nextVersions);
      }
      trackable.reset();
      this._setRecomputing(false);
    }
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    this._setPending();
    this._clearDirty();
    this._notifySubscribers(undefined, undefined);

    this._asyncStartAggregateVersion = this._captureVersionSnapshot();
    this._asyncRetryCount = 0;

    this._promiseId = (this._promiseId + 1) % this.MAX_PROMISE_ID;
    const promiseId = this._promiseId;

    promise
      .then((resolvedValue) => {
        if (promiseId !== this._promiseId) return;

        // Drift detection: Compare aggregate dependency versions to detect changes during async.
        // High drift indicates dependencies changed while awaiting; re-computation may be needed.
        const currentAggregate = this._captureVersionSnapshot();
        const drift = (currentAggregate - this._asyncStartAggregateVersion) & SMI_MAX;
        const isStale = ((PHASE_THRESHOLD - 1 - drift) >>> 31) & 1;

        if (isStale) {
          if (this._asyncRetryCount < this.MAX_ASYNC_RETRIES) {
            this._asyncRetryCount++;
            this._markDirty();
            return;
          }
          const error = new ComputedError(
            `Async drift exceeded threshold after ${this.MAX_ASYNC_RETRIES} retries.`
          );
          this._handleAsyncRejection(error);
          return;
        }

        this._finalizeResolution(resolvedValue);
        this._notifySubscribers(resolvedValue, undefined);
      })
      .catch((err) => {
        if (promiseId !== this._promiseId) return;
        this._handleAsyncRejection(err);
      });
  }

  private _captureVersionSnapshot(): number {
    let aggregate = 0;
    const deps = this._dependencies;
    for (let i = 0, len = deps.length; i < len; i++) {
      const dep = deps[i];
      if (dep) {
        aggregate = (aggregate + dep.version) & SMI_MAX;
      }
    }
    return aggregate;
  }

  private _handleAsyncRejection(err: unknown): void {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);

    if (!(this.flags & COMPUTED_STATE_FLAGS.REJECTED)) {
      this.version = (this.version + 1) & SMI_MAX;
    }

    this._error = error;
    this._setRejected();
    this._clearDirty();
    // Note: _recomputing is already false at this point.
    // Promise resolves/rejects after _recompute's finally block has executed.

    const onError = this._onError;
    if (onError) {
      try {
        onError(error);
      } catch (callbackError) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, callbackError);
      }
    }

    this._notifySubscribers(undefined, undefined);
  }

  private _finalizeResolution(value: T): void {
    const valueChanged =
      !(this.flags & COMPUTED_STATE_FLAGS.RESOLVED) || !this._equal(this._value, value);

    if (valueChanged) {
      this.version = (this.version + 1) & SMI_MAX;
    }

    this._value = value;
    this._clearDirty();
    this._setResolved();
    this._error = null;
    this._setRecomputing(false);
    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
  }

  private _handleComputationError(err: unknown): never {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED);

    this._error = error;
    this._setRejected();
    this._clearDirty();
    this._setRecomputing(false);

    const onError = this._onError;
    if (onError) {
      try {
        onError(error);
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
    const error = this._error;
    if (error?.recoverable && this._hasDefaultValue) {
      return this._defaultValue;
    }
    throw error;
  }

  execute(): void {
    this._markDirty();
  }

  /** @internal */
  _markDirty(): void {
    const flags = this.flags;
    if (flags & (COMPUTED_STATE_FLAGS.RECOMPUTING | COMPUTED_STATE_FLAGS.DIRTY)) return;

    this.flags = flags | COMPUTED_STATE_FLAGS.DIRTY;
    this._notifySubscribers(undefined, undefined);
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
