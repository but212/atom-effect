/**
 * @fileoverview computed: Derived reactive state with automatic dependency tracking
 * @description Creates computed values that automatically update when dependencies change (sync/async support)
 * @optimized Class-based architecture with cache locality and branchless patterns
 */

import { AsyncState, COMPUTED_STATE_FLAGS } from '../../constants';
import type { AtomError } from '../../errors/errors';
import { ComputedError, isPromise, wrapError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import { scheduler } from '../../scheduler';
import { trackingContext } from '../../tracking';
import { DependencyManager } from '../../tracking/dependency-manager';
import type {
  AsyncStateType,
  ComputedAtom,
  ComputedOptions,
  Dependency,
  Subscriber,
} from '../../types';
import { debug, generateId, NO_DEFAULT_VALUE } from '../../utils/debug';
import { SubscriberManager } from '../../utils/subscriber-manager';

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
  // === HOT PATH: Most frequently accessed fields (cache line 1) ===
  private _value: T;
  private _stateFlags: number;

  // === WARM PATH: Frequently accessed fields (cache line 2) ===
  private _error: AtomError | null = null;
  private _promiseId = 0;
  private readonly _equal: (a: T, b: T) => boolean;

  // === COLD PATH: Infrequently accessed fields ===
  private readonly _fn: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _hasDefaultValue: boolean;
  private readonly _onError: ((error: Error) => void) | null;
  private readonly _functionSubscribers: SubscriberManager<() => void>;
  private readonly _objectSubscribers: SubscriberManager<Subscriber>;
  private readonly _dependencyManager: DependencyManager;
  private readonly _id: number;
  private readonly MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

  constructor(fn: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof fn !== 'function') {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    }

    this._fn = fn;
    this._stateFlags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
    this._value = undefined as T;

    const {
      equal = Object.is,
      defaultValue = NO_DEFAULT_VALUE as T,
      lazy = true,
      onError = null,
    } = options;

    this._equal = equal;
    this._defaultValue = defaultValue;
    this._hasDefaultValue = defaultValue !== NO_DEFAULT_VALUE;
    this._onError = onError;
    this._functionSubscribers = new SubscriberManager<() => void>();
    this._objectSubscribers = new SubscriberManager<Subscriber>();
    this._dependencyManager = new DependencyManager();
    this._id = generateId();

    debug.attachDebugInfo(this as unknown as ComputedAtom<T>, 'computed', this._id);

    if (debug.enabled) {
      const debugObj = this as unknown as ComputedAtom<T> & {
        subscriberCount: () => number;
        isDirty: () => boolean;
        dependencies: ReturnType<DependencyManager['getDependencies']>;
        stateFlags: string;
      };
      debugObj.subscriberCount = () =>
        this._functionSubscribers.size + this._objectSubscribers.size;
      debugObj.isDirty = () => this._isDirty();
      debugObj.dependencies = this._dependencyManager.getDependencies();
      debugObj.stateFlags = this._getFlagsAsString();
    }

    if (!lazy) {
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
    this._dependencyManager.unsubscribeAll();
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

    // Track dependencies during computation
    const newDependencies = new Set<unknown>();
    const tempMarkDirty = Object.assign(() => this._markDirty(), {
      addDependency: (dep: unknown) => newDependencies.add(dep),
    });

    try {
      const result = trackingContext.run(tempMarkDirty, this._fn);

      if (isPromise(result)) {
        // Update dependencies before async handling
        this._updateDependencies(newDependencies);
        this._handleAsyncComputation(result);
        this._setRecomputing(false);
        return;
      }

      // Update dependencies for sync result
      this._updateDependencies(newDependencies);
      this._handleSyncResult(result);
    } catch (err) {
      // Update dependencies even on error for recovery support
      this._updateDependencies(newDependencies);
      this._handleComputationError(err);
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
        // Race condition check: ignore if superseded
        if (promiseId !== this._promiseId) return;

        this._handleAsyncResolution(resolvedValue);
      })
      .catch((err) => {
        // Race condition check: ignore if superseded
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

  private _updateDependencies(newDeps: Set<unknown>): void {
    const dependencies = this._dependencyManager.getDependencies();

    // Fast path: No dependency changes (O(1) check)
    if (this._hasSameDependencies(dependencies, newDeps)) {
      return;
    }

    // Slow path: Delta Sync
    this._performDeltaSync(dependencies, newDeps);
  }

  private _hasSameDependencies(current: Dependency[], newDeps: Set<unknown>): boolean {
    if (current.length !== newDeps.size) {
      return false;
    }

    for (let i = 0; i < current.length; i++) {
      if (!newDeps.has(current[i]!)) {
        return false;
      }
    }

    return true;
  }

  private _performDeltaSync(current: Dependency[], newDeps: Set<unknown>): void {
    const existingSet = new Set(current);
    const toRemove: Dependency[] = [];
    const toAdd: Dependency[] = [];

    // Find dependencies to remove
    for (let i = 0; i < current.length; i++) {
      const dep = current[i]!;
      if (!newDeps.has(dep)) {
        toRemove.push(dep);
      }
    }

    // Find dependencies to add
    newDeps.forEach((dep) => {
      if (!existingSet.has(dep as Dependency)) {
        toAdd.push(dep as Dependency);
      }
    });

    // Unsubscribe removed dependencies
    for (let i = 0; i < toRemove.length; i++) {
      this._dependencyManager.removeDependency(toRemove[i]!);
    }

    // Subscribe to new dependencies
    for (let i = 0; i < toAdd.length; i++) {
      this._addDependency(toAdd[i]!);
    }

    // Update dependencies array in place
    current.length = 0;
    newDeps.forEach((dep) => {
      current.push(dep as Dependency);
    });
  }

  private _addDependency(dep: Dependency): void {
    debug.checkCircular(dep, this as unknown as ComputedAtom<T>);

    const count = this._dependencyManager.count;
    debug.warn(count > debug.maxDependencies, ERROR_MESSAGES.LARGE_DEPENDENCY_GRAPH(count));

    try {
      const unsubscribe = dep.subscribe(() => this._markDirty());
      this._dependencyManager.addDependency(dep, unsubscribe);
    } catch (error) {
      throw wrapError(error, ComputedError, 'dependency subscription');
    }
  }

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

    if (typeof current === 'function') {
      this._functionSubscribers.add(current);
    } else if (current.addDependency) {
      current.addDependency(this as unknown as ComputedAtom<T>);
    } else if (current.execute) {
      this._objectSubscribers.add(current as Subscriber);
    }
  }
}

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
