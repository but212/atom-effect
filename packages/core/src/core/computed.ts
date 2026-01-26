import {
  AsyncState,
  COMPUTED_STATE_FLAGS,
  EMPTY_ERROR_ARRAY,
  NODE_FLAGS,
  SMI_MAX,
} from '@/constants';
import { ReactiveDependency } from '@/core/base';
import { syncDependencies, trackDependency } from '@/core/dep-tracking';
import { type AtomError, ComputedError } from '@/errors/errors';
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

// AsyncState mapping - O(1) lookup
const ASYNC_STATE_MASK =
  COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.PENDING | COMPUTED_STATE_FLAGS.REJECTED;
const ASYNC_STATE_LOOKUP = Array(ASYNC_STATE_MASK + 1).fill(AsyncState.IDLE);
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.RESOLVED] = AsyncState.RESOLVED;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.PENDING] = AsyncState.PENDING;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.REJECTED] = AsyncState.REJECTED;

/**
 * Computed atom with lazy evaluation, caching, and async support.
 * Optimized by merging tracker functionality and reducing GC pressure.
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

  // Tracker fields for recomputation (merged from ComputedTrackable)
  private _nextDeps: Dependency[];
  private _nextVersions: number[];
  private _depCount: number;
  private _trackingEpoch: number;

  // Error propagation caching
  private _cachedErrors: readonly Error[] | null;
  private _errorCacheEpoch: number;
  private _cachedHasError: boolean;
  private _hasErrorCacheEpoch: number;

  private _asyncStartAggregateVersion: number;
  private _asyncRetryCount: number;
  private readonly MAX_ASYNC_RETRIES: number = 3;
  private readonly MAX_PROMISE_ID: number = Number.MAX_SAFE_INTEGER - 1;

  constructor(fn: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof fn !== 'function') {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    }
    super();

    this._value = undefined as T;
    // Group flag initializations for stable Hidden Class
    this.flags =
      COMPUTED_STATE_FLAGS.DIRTY |
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.IS_COMPUTED |
      NODE_FLAGS.IS_TRACKER;

    this._error = null;
    this._promiseId = 0;
    this._equal = options.equal ?? Object.is;
    this._fn = fn;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._hasDefaultValue = this._defaultValue !== (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;

    this._fnSubs = [];
    this._objSubs = [];
    this._dependencies = EMPTY_DEPS;
    this._dependencyVersions = EMPTY_VERSIONS;
    this._unsubscribes = EMPTY_UNSUBS;

    this._nextDeps = EMPTY_DEPS;
    this._nextVersions = EMPTY_VERSIONS;
    this._depCount = 0;
    this._trackingEpoch = -1;

    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
    this._cachedHasError = false;
    this._hasErrorCacheEpoch = -1;
    this._asyncStartAggregateVersion = 0;
    this._asyncRetryCount = 0;

    debug.attachDebugInfo(this as unknown as ComputedAtom<T>, 'computed', this.id);

    if (options.lazy === false) {
      try {
        this._recompute();
      } catch {}
    }
  }

  get value(): T {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._fnSubs, this._objSubs);

    const flags = this.flags;
    if (flags & COMPUTED_STATE_FLAGS.RECOMPUTING) {
      if (this._hasDefaultValue) return this._defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if (flags & (COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE)) {
      this._recompute();
    }

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

    const epoch = currentEpoch();
    if (this._hasErrorCacheEpoch === epoch) return this._cachedHasError;

    let hasError = false;
    const deps = this._dependencies;
    for (let i = 0, len = deps.length; i < len; i++) {
      const dep = deps[i];
      // Only computed dependencies can propagate HAS_ERROR
      if (dep && dep.flags & COMPUTED_STATE_FLAGS.HAS_ERROR) {
        hasError = true;
        break;
      }
    }

    this._cachedHasError = hasError;
    this._hasErrorCacheEpoch = epoch;
    return hasError;
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._fnSubs, this._objSubs);
    if (!this.hasError) return EMPTY_ERROR_ARRAY;

    const epoch = currentEpoch();
    if (this._errorCacheEpoch === epoch && this._cachedErrors !== null) return this._cachedErrors;

    // Optimized error collection: avoids Set and Array allocation for common cases
    let result: readonly Error[];
    let firstError: Error | null = this._error;
    let errorSet: Set<Error> | null = null;

    const deps = this._dependencies;
    for (let i = 0, len = deps.length; i < len; i++) {
      const dep = deps[i];
      if (
        dep &&
        (dep.flags & (COMPUTED_STATE_FLAGS.IS_COMPUTED | COMPUTED_STATE_FLAGS.HAS_ERROR)) ===
          (COMPUTED_STATE_FLAGS.IS_COMPUTED | COMPUTED_STATE_FLAGS.HAS_ERROR)
      ) {
        const depErrors = (dep as unknown as ComputedAtom<unknown>).errors;
        for (let j = 0, jLen = depErrors.length; j < jLen; j++) {
          const err = depErrors[j];
          if (!err) continue;
          if (firstError === null) {
            firstError = err;
          } else if (firstError !== err) {
            if (errorSet === null) {
              errorSet = new Set();
              errorSet.add(firstError);
            }
            errorSet.add(err);
          }
        }
      }
    }

    if (errorSet !== null) {
      result = Object.freeze([...errorSet]);
    } else if (firstError !== null) {
      result = Object.freeze([firstError]);
    } else {
      result = EMPTY_ERROR_ARRAY;
    }

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

  /**
   * Tracker implementation: collects dependencies during recompute.
   * @internal
   */
  addDependency(dep: Dependency): void {
    if (dep._lastSeenEpoch === this._trackingEpoch) return;
    dep._lastSeenEpoch = this._trackingEpoch;

    const count = this._depCount++;
    const nextDeps = this._nextDeps;
    const nextVersions = this._nextVersions;

    if (count < nextDeps.length) {
      nextDeps[count] = dep;
      nextVersions[count] = dep.version;
    } else {
      nextDeps.push(dep);
      nextVersions.push(dep.version);
    }
  }

  invalidate(): void {
    this._markDirty();
    this._errorCacheEpoch = -1;
    this._cachedErrors = null;
    this._hasErrorCacheEpoch = -1;
  }

  dispose(): void {
    if (this.flags & COMPUTED_STATE_FLAGS.DISPOSED) return;

    this.flags |= COMPUTED_STATE_FLAGS.DISPOSED | COMPUTED_STATE_FLAGS.DIRTY;

    if (this._unsubscribes !== EMPTY_UNSUBS) {
      const unsubs = this._unsubscribes;
      for (let i = 0, len = unsubs.length; i < len; i++) unsubs[i]?.();
      unsubArrayPool.release(unsubs);
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

    this._fnSubs = [];
    this._objSubs = [];
    this._value = undefined as T;
    this._error = null;
    this._promiseId = (this._promiseId + 1) % this.MAX_PROMISE_ID;
    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
    this._hasErrorCacheEpoch = -1;
  }

  private _recompute(): void {
    const flags = this.flags;
    if (flags & COMPUTED_STATE_FLAGS.RECOMPUTING) return;

    this.flags = flags | COMPUTED_STATE_FLAGS.RECOMPUTING;
    const prevDeps = this._dependencies;
    const prevVersions = this._dependencyVersions;

    this._trackingEpoch = nextEpoch();
    this._nextDeps = depArrayPool.acquire();
    this._nextVersions = versionArrayPool.acquire();
    this._depCount = 0;

    let committed = false;
    try {
      const result = trackingContext.run(this, this._fn);

      // Commit Dependencies
      const depCount = this._depCount;
      this._nextDeps.length = depCount;
      this._nextVersions.length = depCount;

      this._unsubscribes = syncDependencies(this._nextDeps, prevDeps, this._unsubscribes, this);
      this._dependencies = this._nextDeps;
      this._dependencyVersions = this._nextVersions;
      committed = true;

      if (isPromise(result)) {
        this._handleAsyncComputation(result);
      } else {
        this._finalizeResolution(result);
      }
    } catch (e) {
      let err = e as Error;
      if (!committed) {
        try {
          this._nextDeps.length = this._depCount;
          this._nextVersions.length = this._depCount;
          this._unsubscribes = syncDependencies(this._nextDeps, prevDeps, this._unsubscribes, this);
          this._dependencies = this._nextDeps;
          this._dependencyVersions = this._nextVersions;
          committed = true;
        } catch (commitErr) {
          err = commitErr as Error;
        }
      }
      this._handleComputationError(err);
    } finally {
      if (committed) {
        if (prevDeps !== EMPTY_DEPS) depArrayPool.release(prevDeps);
        if (prevVersions !== EMPTY_VERSIONS) versionArrayPool.release(prevVersions);
      } else {
        depArrayPool.release(this._nextDeps);
        versionArrayPool.release(this._nextVersions);
      }
      this._nextDeps = EMPTY_DEPS;
      this._nextVersions = EMPTY_VERSIONS;
      this.flags &= ~COMPUTED_STATE_FLAGS.RECOMPUTING;
    }
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    this.flags =
      (this.flags | COMPUTED_STATE_FLAGS.PENDING) &
      ~(
        COMPUTED_STATE_FLAGS.IDLE |
        COMPUTED_STATE_FLAGS.RESOLVED |
        COMPUTED_STATE_FLAGS.REJECTED |
        COMPUTED_STATE_FLAGS.DIRTY
      );

    this._notifySubscribers(undefined, undefined);

    this._asyncStartAggregateVersion = this._captureVersionSnapshot();
    this._asyncRetryCount = 0;
    this._promiseId = (this._promiseId + 1) % this.MAX_PROMISE_ID;
    const promiseId = this._promiseId;

    promise
      .then((val) => {
        if (promiseId !== this._promiseId) return;
        if (this._captureVersionSnapshot() !== this._asyncStartAggregateVersion) {
          if (this._asyncRetryCount++ < this.MAX_ASYNC_RETRIES) {
            return this._markDirty();
          }
          throw new ComputedError(`Async drift threshold exceeded.`);
        }
        this._finalizeResolution(val);
        this._notifySubscribers(val, undefined);
      })
      .catch((err) => {
        if (promiseId === this._promiseId) this._handleAsyncRejection(err);
      });
  }

  private _captureVersionSnapshot(): number {
    let aggregate = 0;
    const deps = this._dependencies;
    for (let i = 0, len = deps.length; i < len; i++) {
      const dep = deps[i];
      if (dep) aggregate = ((((aggregate << 5) - aggregate) | 0) + dep.version) & SMI_MAX;
    }
    return aggregate;
  }

  private _finalizeResolution(value: T): void {
    const flags = this.flags;
    const valueChanged =
      !(flags & COMPUTED_STATE_FLAGS.RESOLVED) || !this._equal(this._value, value);
    if (valueChanged) this.version = (this.version + 1) & SMI_MAX;

    this._value = value;
    this._error = null;
    this._cachedErrors = null;
    this.flags =
      (flags | COMPUTED_STATE_FLAGS.RESOLVED) &
      ~(
        COMPUTED_STATE_FLAGS.DIRTY |
        COMPUTED_STATE_FLAGS.IDLE |
        COMPUTED_STATE_FLAGS.PENDING |
        COMPUTED_STATE_FLAGS.REJECTED |
        COMPUTED_STATE_FLAGS.HAS_ERROR
      );
  }

  private _handleAsyncRejection(err: unknown): void {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);
    if (!(this.flags & COMPUTED_STATE_FLAGS.REJECTED)) this.version = (this.version + 1) & SMI_MAX;
    this._error = error;
    this.flags =
      (this.flags | COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR) &
      ~(
        COMPUTED_STATE_FLAGS.IDLE |
        COMPUTED_STATE_FLAGS.PENDING |
        COMPUTED_STATE_FLAGS.RESOLVED |
        COMPUTED_STATE_FLAGS.DIRTY
      );
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

  private _handleComputationError(err: unknown): never {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED);
    this._error = error;
    this.flags =
      (this.flags | COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR) &
      ~(
        COMPUTED_STATE_FLAGS.IDLE |
        COMPUTED_STATE_FLAGS.PENDING |
        COMPUTED_STATE_FLAGS.RESOLVED |
        COMPUTED_STATE_FLAGS.DIRTY
      );
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
    if (this._hasDefaultValue) return this._defaultValue;
    throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
  }

  private _handleRejected(): T {
    if (this._error?.recoverable && this._hasDefaultValue) return this._defaultValue;
    throw this._error;
  }

  execute(): void {
    this._markDirty();
  }

  _markDirty(): void {
    const flags = this.flags;
    if (flags & (COMPUTED_STATE_FLAGS.RECOMPUTING | COMPUTED_STATE_FLAGS.DIRTY)) return;
    this.flags = flags | COMPUTED_STATE_FLAGS.DIRTY;
    this._hasErrorCacheEpoch = -1;
    this._notifySubscribers(undefined, undefined);
  }
}

Object.freeze(ComputedAtomImpl.prototype);

/**
 * Creates a reactive computed atom that derives its value from other reactive sources.
 *
 * Automatically tracks dependencies accessed during execution. Supports asynchronous
 * computations, transitioning through pending and resolved states when the computation
 * returns a Promise. Re-evaluation is lazy and triggered by dependency changes.
 *
 * @param fn - The computation function.
 * @param options - Configuration for equality checks, default values, and error handling.
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
