/**
 * @fileoverview computed: Derived reactive state with automatic dependency tracking
 * @description Creates computed values that automatically update when dependencies change (sync/async support)
 * @optimized Class-based architecture with cache locality and branchless patterns
 */

import { AsyncState, COMPUTED_STATE_FLAGS, SMI_MAX } from '../../constants';
import { nextEpoch } from '../../epoch';
import type { AtomError } from '../../errors/errors';
import { ComputedError, isPromise, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { depArrayPool, EMPTY_DEPS } from '../../pool';
import { scheduler } from '../../scheduler';
import { trackingContext } from '../../tracking';
import type { DependencyTracker } from '../../tracking/tracking.types';

interface SchedulerJob {
  (): void;
  _nextEpoch?: number;
}

import type {
  AsyncStateType,
  ComputedAtom,
  ComputedOptions,
  Dependency,
  Subscriber,
} from '../../types';
import { debug, generateId, NO_DEFAULT_VALUE } from '../../utils/debug';
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
class ComputedAtomImpl<T> implements ComputedAtom<T> {
  // === Smi Fields (Fixed Order for V8 Hidden Class) ===
  /** Unique numerical identifier (Smi) */
  readonly id: number;

  /** Version counter for change detection (Smi) */
  version: number;

  /** Internal flags (Smi) */
  flags: number;

  /** Last seen epoch for dependency collection (Smi) */
  _lastSeenEpoch: number;

  // === HOT PATH: Most frequently accessed fields (cache line 1) ===
  private _value: T;
  private _stateFlags: number;

  // === WARM PATH: Frequently accessed fields (cache line 2) ===
  private _error: AtomError | null;
  private _promiseId: number;
  private readonly _equal: (a: T, b: T) => boolean;

  // === COLD PATH: Infrequently accessed fields ===
  private readonly _fn: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _hasDefaultValue: boolean;
  private readonly _onError: ((error: Error) => void) | null;
  private readonly _functionSubscribers: SubscriberManager<() => void>;
  private readonly _objectSubscribers: SubscriberManager<Subscriber>;
  // Optimized: Replaced DependencyManager with direct array + map
  private _dependencies: Dependency[];

  // ⚡ HFT Optimization: Map<number, Unsub> instead of WeakMap
  // dependency.id is Smi, so map lookup is extremely fast (integer key optimization)
  private readonly _subscriptions: Map<number, () => void>;

  // ⚡ HFT Optimization: Reusable SchedulerJob to prevent closure allocation
  private readonly _recomputeJob: SchedulerJob;

  private readonly _trackable: TrackableListener;
  // private readonly _id: number; // Replaced by public id
  private readonly MAX_PROMISE_ID: number;

  constructor(fn: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof fn !== 'function') {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    }

    // 1. Smi Fields Initialization
    this.id = generateId() & SMI_MAX;
    this.version = 0;
    this.flags = 0;
    this._lastSeenEpoch = -1;

    // 2. Fixed order initialization (HOT PATH first)
    this._value = undefined as T;
    this._stateFlags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;

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
    this._functionSubscribers = new SubscriberManager<() => void>();
    this._objectSubscribers = new SubscriberManager<Subscriber>();

    // Optimized Dependency Management
    this._dependencies = EMPTY_DEPS as Dependency[];
    this._subscriptions = new Map();

    // ⚡ Pre-allocate recompute job
    this._recomputeJob = () => {
      if (this._isDirty()) {
        try {
          this._recompute();
        } catch {
          // Error already handled
        }
      }
    };

    // Trackable closure for dependency collection
    // We bind it once to avoid allocation during recompute
    this._trackable = Object.assign(() => this._markDirty(), {
      addDependency: (_dep: unknown) => {
        // This is called by Atom.value getter via trackingContext
        // We'll handle the actual collection logic inside recompute's context
        // but here we just need to ensure it works if called directly?
        // Actually, trackingContext.run sets the current collector.
        // When Atom calls _track(current), current is this._trackable.
        // But we need the *active* collector buffer.
        // We can store the active buffer in a temporary field or rely on the fact
        // that _recompute sets up the collection environment.
        // See recompute implementation below.
      },
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
        this._functionSubscribers.size + this._objectSubscribers.size;
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

  // === PUBLIC API ===

  get value(): T {
    // Branchless fast path: single bitwise check for (resolved AND not dirty)
    const isFastPath =
      (this._stateFlags & (COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.DIRTY)) ===
      COMPUTED_STATE_FLAGS.RESOLVED;

    if (isFastPath) {
      this._registerTracking();
      return this._value;
    }

    // Slow path: state transition required
    const result = this._computeValue();
    this._registerTracking();
    return result;
  }

  subscribe(listener: () => void): () => void {
    if (typeof listener !== 'function') {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_SUBSCRIBER_MUST_BE_FUNCTION);
    }
    return this._functionSubscribers.add(listener);
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
  }

  dispose(): void {
    // Unsubscribe from all dependencies
    // Iterate stored subscriptions
    // We cannot iterate WeakMap, but we know which deps we have in _dependencies (if still holding them)
    // Wait, _syncDependencies iterates _dependencies.
    // So current _dependencies can be used to unsubscribe.

    if (this._dependencies !== EMPTY_DEPS) {
      for (const dep of this._dependencies) {
        const unsub = this._subscriptions.get(dep.id);
        if (unsub) unsub();
        this._subscriptions.delete(dep.id);
      }
      depArrayPool.release(this._dependencies as Dependency[]);
    }
    this._dependencies = EMPTY_DEPS as Dependency[];

    this._functionSubscribers.clear();
    this._objectSubscribers.clear();
    this._stateFlags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
    this._error = null;
    this._value = undefined as T;
    this._promiseId = (this._promiseId + 1) % this.MAX_PROMISE_ID;
  }

  // === PRIVATE: State Flag Operations (inlined for performance) ===

  private _isDirty(): boolean {
    return (this._stateFlags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;
  }

  private _setDirty(): void {
    this._stateFlags |= COMPUTED_STATE_FLAGS.DIRTY;
  }

  private _clearDirty(): void {
    this._stateFlags &= ~COMPUTED_STATE_FLAGS.DIRTY;
  }

  private _isIdle(): boolean {
    return (this._stateFlags & COMPUTED_STATE_FLAGS.IDLE) !== 0;
  }

  private _setIdle(): void {
    this._stateFlags |= COMPUTED_STATE_FLAGS.IDLE;
    this._stateFlags &= ~(
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.REJECTED
    );
  }

  private _isPending(): boolean {
    return (this._stateFlags & COMPUTED_STATE_FLAGS.PENDING) !== 0;
  }

  private _setPending(): void {
    this._stateFlags |= COMPUTED_STATE_FLAGS.PENDING;
    this._stateFlags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.REJECTED
    );
  }

  private _isResolved(): boolean {
    return (this._stateFlags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0;
  }

  private _setResolved(): void {
    this._stateFlags |= COMPUTED_STATE_FLAGS.RESOLVED;
    this._stateFlags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.REJECTED |
      COMPUTED_STATE_FLAGS.HAS_ERROR
    );
  }

  private _isRejected(): boolean {
    return (this._stateFlags & COMPUTED_STATE_FLAGS.REJECTED) !== 0;
  }

  private _setRejected(): void {
    this._stateFlags |= COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR;
    this._stateFlags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.RESOLVED
    );
  }

  private _isRecomputing(): boolean {
    return (this._stateFlags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0;
  }

  private _setRecomputing(value: boolean): void {
    if (value) {
      this._stateFlags |= COMPUTED_STATE_FLAGS.RECOMPUTING;
    } else {
      this._stateFlags &= ~COMPUTED_STATE_FLAGS.RECOMPUTING;
    }
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
    if (this._isPending()) return this._handlePending();
    if (this._isRejected()) return this._handleRejected();

    if (this._isDirty() || this._isIdle()) {
      this._recompute();
      if (this._isPending()) {
        return this._handlePending();
      }
    }

    return this._value;
  }

  private _recompute(): void {
    if (!this._isDirty() && this._isResolved()) {
      return;
    }

    this._setRecomputing(true);

    // ⚡ HFT Optimization: Pooled Array + Epoch
    const prevDeps = this._dependencies;
    const nextDeps = depArrayPool.acquire();
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
      } else {
        nextDeps.push(dep);
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

      if (isPromise(result)) {
        // Sync dependencies before awaiting
        this._syncDependencies(prevDeps, nextDeps, epoch);
        this._dependencies = nextDeps;
        committed = true;

        this._handleAsyncComputation(result);
        this._setRecomputing(false);
        return;
      }

      // Sync dependencies for synchronous result
      this._syncDependencies(prevDeps, nextDeps, epoch);
      this._dependencies = nextDeps;
      committed = true;

      this._handleSyncResult(result);
    } catch (err) {
      // On error, we must still sync dependencies that were collected up to the error point.
      // This ensures that if a dependency caused the error (or was accessed before),
      // we subscribe to it so we can recompute when it changes (recovery).

      nextDeps.length = depCount;
      this._syncDependencies(prevDeps, nextDeps, epoch);
      this._dependencies = nextDeps;
      committed = true;

      this._handleComputationError(err);
    } finally {
      this._trackable.addDependency = originalAdd;

      if (committed) {
        // Success: Release old deps
        if (prevDeps !== EMPTY_DEPS) {
          depArrayPool.release(prevDeps as Dependency[]);
        }
      } else {
        // Failure: Release new deps (unused)
        depArrayPool.release(nextDeps);
      }
    }
  }

  /**
   * Synchronizes subscriptions based on dependency changes.
   * O(N) Diff using Epoch.
   */
  private _syncDependencies(prevDeps: Dependency[], nextDeps: Dependency[], epoch: number): void {
    // 1. Unsubscribe removed dependencies
    if (prevDeps !== EMPTY_DEPS) {
      for (let i = 0; i < prevDeps.length; i++) {
        const dep = prevDeps[i];
        // Safety check for sparse arrays or strict null checks
        if (!dep) continue;

        // If lastSeenEpoch != epoch, it was NOT collected in this run -> Removed
        if (dep._lastSeenEpoch !== epoch) {
          const unsub = this._subscriptions.get(dep.id);
          if (unsub) {
            unsub();
            this._subscriptions.delete(dep.id);
          }
        }
      }
    }

    // 2. Subscribe to new dependencies
    for (let i = 0; i < nextDeps.length; i++) {
      const dep = nextDeps[i];
      if (!dep) continue;

      // Check if already subscribed
      if (!this._subscriptions.has(dep.id)) {
        // New dependency
        debug.checkCircular(dep, this as unknown as ComputedAtom<T>);
        // Subscription
        const unsub = dep.subscribe(() => this._markDirty());
        this._subscriptions.set(dep.id, unsub);
      }
    }
  }

  private _handleSyncResult(result: T): void {
    const shouldUpdate = !this._isResolved() || !this._equal(this._value, result);

    this._value = result;
    this._clearDirty();
    this._setResolved();
    this._error = null;
    this._setRecomputing(false);

    if (shouldUpdate) {
      this._notifySubscribers();
    }
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    this._setPending();

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
    const shouldUpdate = !this._isResolved() || !this._equal(this._value, resolvedValue);

    this._value = resolvedValue;
    this._clearDirty();
    this._setResolved();
    this._error = null;
    this._setRecomputing(false);

    if (shouldUpdate) {
      this._notifySubscribers();
    }
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

    this._notifySubscribers();
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

  // === PRIVATE: Dependency Management ===
  // (Replaced by _syncDependencies and inline pool logic)

  // === PRIVATE: Subscriber Management ===

  private _markDirty(): void {
    if (this._isRecomputing() || this._isDirty()) return;

    this._setDirty();
    this._setIdle();

    if (this._functionSubscribers.hasSubscribers || this._objectSubscribers.hasSubscribers) {
      scheduler.schedule(() => {
        if (this._isDirty()) {
          try {
            this._recompute();
          } catch {
            // Error already handled
          }
        }
      });
    }
  }

  private _notifySubscribers(): void {
    if (!this._functionSubscribers.hasSubscribers && !this._objectSubscribers.hasSubscribers) {
      return;
    }

    scheduler.schedule(() => {
      this._functionSubscribers.forEachSafe(
        (subscriber) => subscriber(),
        (err) => console.error(err)
      );

      this._objectSubscribers.forEachSafe(
        (subscriber) => subscriber.execute(),
        (err) => console.error(err)
      );
    });
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
        this._functionSubscribers.add(current as () => void);
      }
    } else if ((current as DependencyTracker).execute) {
      this._objectSubscribers.add(current as Subscriber);
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
