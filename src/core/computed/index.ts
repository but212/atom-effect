/**
 * @fileoverview computed: Derived reactive state with automatic dependency tracking
 * @description Creates computed values that automatically update when dependencies change (sync/async support)
 * @optimized Class-based architecture with cache locality and branchless patterns
 */

import { AsyncState, COMPUTED_STATE_FLAGS, SMI_MAX } from '../../constants';
import { ReactiveDependency } from '../../core/base/reactive-dependency';
import { syncDependencies } from '../../core/utils/dep-tracking';
import type { AtomError } from '../../errors/errors';
import { ComputedError, isPromise, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { nextEpoch } from '../../internal/epoch';
import {
  depArrayPool,
  EMPTY_DEPS,
  EMPTY_UNSUBS,
  EMPTY_VERSIONS,
  unsubArrayPool,
  versionArrayPool,
} from '../../internal/pool';
import { trackingContext } from '../../tracking';
import type { DependencyTracker } from '../../tracking/tracking.types';

import type {
  AsyncStateType,
  ComputedAtom,
  ComputedOptions,
  Dependency,
  Subscriber,
} from '../../types';
import { debug, NO_DEFAULT_VALUE } from '../../utils/debug';
import { SubscriberManager } from '../../utils/subscriber-manager';

type TrackableListener = (() => void) & {
  addDependency: (dep: unknown) => void;
};

/**
 * Optimized ComputedAtom implementation with class-based architecture
 *
 * Key optimizations:
 * - Cache-friendly field layout (hot fields first)
 * - Inline bit flags (no separate class instance)
 * - Branchless fast path for value access
 * - Reduced indirection and closure overhead
 *
 * @template T - The type of the computed value
 */
class ComputedAtomImpl<T> extends ReactiveDependency<T> implements ComputedAtom<T>, Subscriber {
  // === HOT PATH: Most frequently accessed fields (cache line 1) ===
  private _value: T;

  // NOTE: We reused 'flags' from ReactiveNode for state flags!
  // Smi fields from ReactiveDependency: id, flags, version, _lastSeenEpoch

  // === WARM PATH: Frequently accessed fields (cache line 2) ===
  private _error: AtomError | null;
  private _promiseId: number;
  private readonly _equal: (a: T, b: T) => boolean;

  // === COLD PATH: Infrequently accessed fields ===
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
  // private readonly _id: number; // Replaced by public id
  private readonly MAX_PROMISE_ID: number;

  constructor(fn: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof fn !== 'function') {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    }

    // 1. Smi Fields Initialization (via super)
    super();

    // 2. Fixed order initialization (HOT PATH first)
    this._value = undefined as T;
    // We use inherited 'flags' and initialize it with DIRTY | IDLE
    this.flags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;

    // WARM PATH
    this._error = null;
    this._promiseId = 0;
    this._equal = options.equal ?? Object.is;

    // COLD PATH & Constants
    this._fn = fn;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._hasDefaultValue = this._defaultValue !== (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;
    this.MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

    // Managers & Structures
    this._functionSubscribersStore = new SubscriberManager<(newValue?: T, oldValue?: T) => void>();
    this._objectSubscribersStore = new SubscriberManager<Subscriber>();

    // Optimized Dependency Management
    this._dependencies = EMPTY_DEPS as Dependency[];
    this._dependencyVersions = EMPTY_VERSIONS as number[];
    this._unsubscribes = EMPTY_UNSUBS as (() => void)[];

    // Pre-bound notification function (no scheduler - Push-State, Pull-Value pattern)
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

    // Trackable closure for dependency collection
    // We bind it once to avoid allocation during recompute
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

    // Lazy check - normalized access
    if (options.lazy === false) {
      try {
        this._recompute();
      } catch {
        // Ignore initial computation failure for non-lazy computed
      }
    }
  }

  // === Abstract Accessor Implementations ===
  protected get _functionSubscribers(): SubscriberManager<(newValue?: T, oldValue?: T) => void> {
    return this._functionSubscribersStore;
  }

  protected get _objectSubscribers(): SubscriberManager<Subscriber> {
    return this._objectSubscribersStore;
  }

  // === PUBLIC API ===

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
    // Unsubscribe from all dependencies
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

  // === PRIVATE: State Flag Operations (inlined for performance) ===

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
    // Branchless: clear the bit, then OR with the mask if value is true
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

  // === PRIVATE: Core Computation Logic ===

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
    // Note: Caller has already verified recomputation is needed via _shouldRecompute()
    if (this._isRecomputing()) return;

    this._setRecomputing(true);

    const prevDeps = this._dependencies;
    const prevVersions = this._dependencyVersions;
    const nextDeps = depArrayPool.acquire();
    const nextVersions = versionArrayPool.acquire();
    const epoch = nextEpoch();

    let depCount = 0;

    // Collector function (closure-free if possible, but we need closure for nextDeps capture)
    // To allow `_trackable.addDependency` to work, we need to wire it up.
    // We override `addDependency` of `_trackable` temporarily?
    // Or we use a scoped collector.

    const collect = (dep: Dependency) => {
      // O(1) deduplication check
      if (dep._lastSeenEpoch === epoch) return;
      dep._lastSeenEpoch = epoch;

      // Add to buffer
      if (depCount < nextDeps.length) {
        nextDeps[depCount] = dep;
        nextVersions[depCount] = dep.version;
      } else {
        nextDeps.push(dep);
        nextVersions.push(dep.version);
      }
      depCount++;
    };

    // Store original addDependency to restore later (or use a dedicated collector object)
    const originalAdd = this._trackable.addDependency;
    this._trackable.addDependency = collect as (dep: unknown) => void;

    let committed = false;

    try {
      const result = trackingContext.run(this._trackable, this._fn);

      // Trim array to actual count
      nextDeps.length = depCount;
      nextVersions.length = depCount;

      if (isPromise(result)) {
        // Sync dependencies before awaiting
        // Using shared logic!
        this._unsubscribes = syncDependencies(nextDeps, prevDeps, this._unsubscribes, this);
        this._dependencies = nextDeps;
        this._dependencyVersions = nextVersions;
        committed = true;

        this._handleAsyncComputation(result);
        this._setRecomputing(false);
        return;
      }

      // Sync dependencies for synchronous result
      this._unsubscribes = syncDependencies(nextDeps, prevDeps, this._unsubscribes, this);
      this._dependencies = nextDeps;
      this._dependencyVersions = nextVersions;
      committed = true;

      this._handleSyncResult(result);
    } catch (err) {
      // On error, we must still sync dependencies that were collected up to the error point.
      // This ensures that if a dependency caused the error (or was accessed before),
      // we subscribe to it so we can recompute when it changes (recovery).

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
        // Success: Release old deps
        if (prevDeps !== EMPTY_DEPS) {
          depArrayPool.release(prevDeps as Dependency[]);
        }
        if (prevVersions !== EMPTY_VERSIONS) {
          versionArrayPool.release(prevVersions);
        }
      } else {
        // Failure: Release new deps (unused)
        depArrayPool.release(nextDeps);
        versionArrayPool.release(nextVersions);
      }
    }
  }

  private _handleSyncResult(result: T): void {
    // Increment version only if value actually changed (respects `equal` option)
    // This allows downstream Computed atoms to potentially skip recomputation
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

    // Branchless promise ID increment with overflow protection
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
    // Increment version only if value actually changed (respects `equal` option)
    // This allows downstream Computed atoms to potentially skip recomputation
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

    // Use internal notify which uses abstract accessors
    // We need to notify manually because this is an async rejection handled internally
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

  // === PRIVATE: Subscriber Management ===

  /**
   * Subscriber interface implementation (Zero-Allocation pattern)
   * Called by dependencies when they change - delegates to _markDirty
   */
  execute(): void {
    this._markDirty();
  }

  /**
   * Push-State, Pull-Value pattern:
   * Marks this computed as dirty and propagates to all subscribers.
   * - Object subscribers (Computed atoms): will mark themselves dirty
   * - Function subscribers (Effects): will schedule their execution
   * Actual recomputation happens lazily when .value is accessed (Pull).
   */

  private _markDirty(): void {
    if (this._isRecomputing() || this._isDirty()) return;

    this._setDirty();
    // this._setIdle();

    // Propagate dirty flag to ALL subscribers synchronously
    this._notifyJob();
  }

  private _registerTracking(): void {
    const current = trackingContext.getCurrent();
    if (!current) return;

    // Check for addDependency first to support TrackableListener
    if (
      typeof current === 'object' &&
      current !== null &&
      (current as DependencyTracker).addDependency
    ) {
      (current as DependencyTracker).addDependency!(this as unknown as ComputedAtom<T>);
    } else if (typeof current === 'function') {
      const fnWithDep = current as TrackableListener;
      if (fnWithDep.addDependency) {
        fnWithDep.addDependency(this as unknown as ComputedAtom<T>);
      } else {
        this._functionSubscribersStore.add(current as () => void);
      }
    } else if ((current as DependencyTracker).execute) {
      this._objectSubscribersStore.add(current as Subscriber);
    }
  }
}

// Optimization: Freeze prototype to prevent shape changes
Object.freeze(ComputedAtomImpl.prototype);

/**
 * Creates a computed value that automatically tracks and reacts to dependencies
 *
 * Computed atoms are derived reactive state that:
 * - Automatically track dependencies accessed during computation
 * - Lazily recompute only when dependencies change (dirty checking)
 * - Support both synchronous and asynchronous computations
 * - Cache results until dependencies change (memoization)
 * - Use bit flags for efficient state management
 * - Provide async state tracking (idle/pending/resolved/rejected)
 *
 * @template T - The type of the computed value
 * @param fn - Computation function (can return T or Promise<T>)
 * @param options - Configuration options
 * @returns A readonly computed atom with automatic dependency tracking
 *
 * @example
 * ```ts
 * // Synchronous computed
 * const count = atom(0);
 * const doubled = computed(() => count.value * 2);
 *
 * // Asynchronous computed with default value
 * const userData = computed(
 *   async () => fetch(`/api/user/${userId.value}`).then(r => r.json()),
 *   { defaultValue: null }
 * );
 * ```
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
