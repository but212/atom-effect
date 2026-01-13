import { AsyncState, COMPUTED_STATE_FLAGS, SMI_MAX } from '@/constants';
import { ReactiveDependency } from '@/core/base/reactive-dependency';
import { syncDependencies } from '@/core/utils/dep-tracking';
import type { AtomError } from '@/errors/errors';
import { ComputedError, isPromise, wrapError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import { nextEpoch } from '@/internal/epoch';
import {
  depArrayPool,
  EMPTY_DEPS,
  EMPTY_UNSUBS,
  EMPTY_VERSIONS,
  unsubArrayPool,
  versionArrayPool,
} from '@/internal/pool';
import { trackingContext } from '@/tracking';
import {
  hasDependencyMethod,
  hasExecuteMethod,
  isPlainListener,
} from '@/tracking/tracking.types';

import type {
  AsyncStateType,
  ComputedAtom,
  ComputedOptions,
  Dependency,
  Subscriber,
} from '@/types';
import { debug, NO_DEFAULT_VALUE } from '@/utils/debug';
import { SubscriberManager } from '@/utils/subscriber-manager';

type TrackableListener = (() => void) & {
  addDependency: (dep: unknown) => void;
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

    this._dependencies = EMPTY_DEPS as Dependency[];
    this._dependencyVersions = EMPTY_VERSIONS as number[];
    this._unsubscribes = EMPTY_UNSUBS as (() => void)[];

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
      addDependency: (_dep: unknown) => {},
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
    const result = this._computeValue();
    this._registerTracking();
    return result;
  }

  peek(): T {
    return this._value;
  }

  get state(): AsyncStateType {
    return this._getAsyncState();
  }

  get hasError(): boolean {
    return this._isRejected();
  }

  get lastError(): Error | null {
    return this._error;
  }

  get isPending(): boolean {
    return this._isPending();
  }

  get isResolved(): boolean {
    return this._isResolved();
  }

  invalidate(): void {
    this._markDirty();
    if (this._dependencyVersions !== EMPTY_VERSIONS) {
      versionArrayPool.release(this._dependencyVersions);
      this._dependencyVersions = EMPTY_VERSIONS as number[];
    }
  }

  dispose(): void {
    if (this._unsubscribes !== EMPTY_UNSUBS) {
      for (let i = 0; i < this._unsubscribes.length; i++) {
        const unsub = this._unsubscribes[i];
        if (unsub) unsub();
      }
      unsubArrayPool.release(this._unsubscribes);
      this._unsubscribes = EMPTY_UNSUBS as (() => void)[];
    }

    if (this._dependencies !== EMPTY_DEPS) {
      depArrayPool.release(this._dependencies);
      this._dependencies = EMPTY_DEPS as Dependency[];
    }

    if (this._dependencyVersions !== EMPTY_VERSIONS) {
      versionArrayPool.release(this._dependencyVersions);
      this._dependencyVersions = EMPTY_VERSIONS as number[];
    }

    this._functionSubscribersStore.clear();
    this._objectSubscribersStore.clear();
    this.flags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
    this._error = null;
    this._value = undefined as T;
    this._promiseId = (this._promiseId + 1) % this.MAX_PROMISE_ID;
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
    if (this._isPending()) return AsyncState.PENDING;
    if (this._isResolved()) return AsyncState.RESOLVED;
    if (this._isRejected()) return AsyncState.REJECTED;
    return AsyncState.IDLE;
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

    const prevDeps = this._dependencies;
    const prevVersions = this._dependencyVersions;
    const nextDeps = depArrayPool.acquire();
    const nextVersions = versionArrayPool.acquire();
    const epoch = nextEpoch();

    let depCount = 0;

    const collect = (dep: Dependency) => {
      if (dep._lastSeenEpoch === epoch) return;
      dep._lastSeenEpoch = epoch;

      if (depCount < nextDeps.length) {
        nextDeps[depCount] = dep;
        nextVersions[depCount] = dep.version;
      } else {
        nextDeps.push(dep);
        nextVersions.push(dep.version);
      }
      depCount++;
    };

    const originalAdd = this._trackable.addDependency;
    this._trackable.addDependency = collect as (dep: unknown) => void;

    let committed = false;

    try {
      const result = trackingContext.run(this._trackable, this._fn);

      nextDeps.length = depCount;
      nextVersions.length = depCount;

      if (isPromise(result)) {
        this._unsubscribes = syncDependencies(nextDeps, prevDeps, this._unsubscribes, this);
        this._dependencies = nextDeps;
        this._dependencyVersions = nextVersions;
        committed = true;

        this._handleAsyncComputation(result);
        this._setRecomputing(false);
        return;
      }

      this._unsubscribes = syncDependencies(nextDeps, prevDeps, this._unsubscribes, this);
      this._dependencies = nextDeps;
      this._dependencyVersions = nextVersions;
      committed = true;

      this._handleSyncResult(result);
    } catch (err) {
      nextDeps.length = depCount;
      nextVersions.length = depCount;
      this._unsubscribes = syncDependencies(nextDeps, prevDeps, this._unsubscribes, this);
      this._dependencies = nextDeps;
      this._dependencyVersions = nextVersions;
      committed = true;

      this._handleComputationError(err);
    } finally {
      this._trackable.addDependency = originalAdd;

      if (committed) {
        if (prevDeps !== EMPTY_DEPS) {
          depArrayPool.release(prevDeps as Dependency[]);
        }
        if (prevVersions !== EMPTY_VERSIONS) {
          versionArrayPool.release(prevVersions);
        }
      } else {
        depArrayPool.release(nextDeps);
        versionArrayPool.release(nextVersions);
      }
    }
  }

  private _handleSyncResult(result: T): void {
    const valueChanged = !this._isResolved() || !this._equal(this._value, result);
    if (valueChanged) {
      this.version = (this.version + 1) & SMI_MAX;
    }

    this._value = result;
    this._clearDirty();
    this._setResolved();
    this._error = null;
    this._setRecomputing(false);
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    this._setPending();
    this._clearDirty();

    this._promiseId = this._promiseId >= this.MAX_PROMISE_ID ? 1 : this._promiseId + 1;
    const promiseId = this._promiseId;

    promise
      .then((resolvedValue) => {
        if (promiseId !== this._promiseId) return;
        this._handleAsyncResolution(resolvedValue);
      })
      .catch((err) => {
        if (promiseId !== this._promiseId) return;
        this._handleAsyncRejection(err);
      });
  }

  private _handleAsyncResolution(resolvedValue: T): void {
    const valueChanged = !this._isResolved() || !this._equal(this._value, resolvedValue);
    if (valueChanged) {
      this.version = (this.version + 1) & SMI_MAX;
    }

    this._value = resolvedValue;
    this._clearDirty();
    this._setResolved();
    this._error = null;
    this._setRecomputing(false);
  }

  private _handleAsyncRejection(err: unknown): void {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);

    this._error = error;
    this._setRejected();
    this._clearDirty();
    this._setRecomputing(false);

    if (this._onError && typeof this._onError === 'function') {
      try {
        this._onError(error);
      } catch (callbackError) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, callbackError);
      }
    }

    this._notifySubscribers(undefined, undefined);
  }

  private _handleComputationError(err: unknown): never {
    const error = wrapError(err, ComputedError, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED);

    this._error = error;
    this._setRejected();
    this._clearDirty();
    this._setRecomputing(false);

    if (this._onError && typeof this._onError === 'function') {
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
    const current = trackingContext.getCurrent();
    if (!current) return;

    // Priority 1: Has addDependency method (TrackableListener or DependencyTracker)
    if (hasDependencyMethod(current)) {
      current.addDependency(this as unknown as ComputedAtom<T>);
      return;
    }

    // Priority 2: Plain function callback
    if (isPlainListener(current)) {
      this._functionSubscribersStore.add(current);
      return;
    }

    // Priority 3: Object with execute method (Subscriber pattern)
    if (hasExecuteMethod(current)) {
      this._objectSubscribersStore.add(current);
    }
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
