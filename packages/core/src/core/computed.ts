import { Result } from '@but212/atom-effect-utils';
import {
  AsyncState,
  COMPUTED_CONFIG,
  COMPUTED_STATE_FLAGS,
  EMPTY_ERROR_ARRAY,
  EPOCH_CONSTANTS,
  IS_DEV,
} from '@/constants';
import { ReactiveNode } from '@/core/base';
import { ComputedError, ERROR_MESSAGES, wrapError } from '@/errors';
import { BRAND, BrandFlags } from '@/symbols';
import type {
  AsyncStateType,
  ComputedAtom,
  ComputedOptions,
  Dependency,
  Subscriber,
} from '@/types';
import { debug, NO_DEFAULT_VALUE } from '@/utils/debug';
import { isPromise } from '@/utils/type-guards';
import { DepSlotBuffer } from './buffers';
import { nextEpoch, nextVersion } from './scheduler';
import { DependencyLink, trackingContext, untracked } from './tracking';

const {
  IDLE,
  DIRTY,
  PENDING,
  RESOLVED,
  REJECTED,
  HAS_ERROR,
  RECOMPUTING,
  DISPOSED,
  IS_COMPUTED,
  FORCE_COMPUTE,
} = COMPUTED_STATE_FLAGS;

/**
 * Internal implementation of a {@link ComputedAtom}.
 *
 * This class handles the orchestration of lazy evaluation, result caching, and
 * automatic dependency tracking for derived reactive state. Evaluation is
 * deferred until the `value` is explicitly accessed, ensuring that computation
 * only occurs when necessary.
 */
class ComputedAtomImpl<T> extends ReactiveNode<T> implements ComputedAtom<T>, Subscriber {
  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Computed;

  // Bookkeeping fields grouped for V8 SMI optimization
  /**
   * A rolling ID used to identify and cancel stale asynchronous operations.
   * @internal
   */
  private _promiseId = 0;
  /**
   * The epoch ID used during the current dependency tracking cycle.
   * @internal
   */
  private _trackEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  /**
   * The number of dependencies captured in the current cycle.
   * @internal
   */
  private _trackCount = 0;

  private _value: T;
  private _error: Error | null = null;

  /** Buffered storage for the node's dependencies. */
  _deps = new DepSlotBuffer();

  private readonly _equal: (a: T, b: T) => boolean;
  private readonly _computation: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _onError: ((error: Error) => void) | null;

  constructor(computation: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof computation !== 'function')
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    super();

    this._value = undefined as T;
    // Optimization: Initialize in a DIRTY and IDLE state to ensure the first access triggers evaluation.
    this.flags = IS_COMPUTED | DIRTY | IDLE;
    this._equal = options.equal ?? Object.is;
    this._computation = computation;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;

    debug.attachDebugInfo(this, 'computed', this.id, options.name);

    // Logic: Eager evaluation if the `lazy` option is explicitly disabled.
    if (options.lazy === false) {
      try {
        this._recompute();
      } catch {
        /* Error handling is performed within _recompute and _handleError */
      }
    }
  }

  /**
   * Indicates whether the computed result is potentially stale.
   * @internal
   */
  get isDirty(): boolean {
    return (this.flags & DIRTY) !== 0;
  }

  /**
   * Indicates whether the most recent computation resulted in a rejection.
   * @internal
   */
  get isRejected(): boolean {
    return (this.flags & REJECTED) !== 0;
  }

  /**
   * Indicates whether a computation is currently in progress.
   * @internal
   */
  get isRecomputing(): boolean {
    return (this.flags & RECOMPUTING) !== 0;
  }

  /**
   * Returns the current computed value, validating dependencies and re-evaluating if necessary.
   *
   * Logic: The evaluation follows a multi-path resolution strategy:
   * 1. Stability Path: Returns the cached value immediately if the node is stable (RESOLVED and not DIRTY).
   * 2. Security Path: Blocks execution and handles cleanup if the node is DISPOSED or if a circularity is detected.
   * 3. Evaluation Path: Synchronously validates dependency versions and triggers re-computation if stale.
   *
   * @throws {ComputedError} If a circular dependency is detected or if an async computed is pending without a default value.
   */
  get value(): T {
    const context = trackingContext.current;
    context?.addDependency(this);

    const flags = this.flags;
    // Logic: Direct return for resolved, non-stale values.
    if ((flags & (RESOLVED | DIRTY | IDLE | DISPOSED | RECOMPUTING)) === RESOLVED) {
      return this._value;
    }

    if ((flags & DISPOSED) !== 0) throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);

    // Caution: Circular dependency detection via the RECOMPUTING flag.
    if ((flags & RECOMPUTING) !== 0) {
      const defaultValue = this._defaultValue;
      if (defaultValue !== (NO_DEFAULT_VALUE as T)) return defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if ((flags & (DIRTY | IDLE)) !== 0) {
      const dependencies = this._deps;
      const shouldRecompute =
        (flags & (IDLE | FORCE_COMPUTE)) !== 0 || dependencies.length === 0 || this._isDirty();

      if (!shouldRecompute) {
        this.flags &= ~DIRTY;
      } else {
        this._recompute();
      }
      if ((this.flags & RESOLVED) !== 0) return this._value;
    }

    const defaultValue = this._defaultValue;
    const hasDefault = defaultValue !== (NO_DEFAULT_VALUE as T);

    if ((this.flags & PENDING) !== 0) {
      if (hasDefault) return defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
    }

    if ((this.flags & REJECTED) !== 0) {
      if (hasDefault) return defaultValue;
      throw this._error;
    }

    return this._value;
  }

  /**
   * Retrieves the current cached value without triggering validation or re-computation.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Retrieves the current lifecycle state of the computation.
   */
  get state(): AsyncStateType {
    const context = trackingContext.current;
    context?.addDependency(this);
    const flags = this.flags;
    if ((flags & RESOLVED) !== 0) return AsyncState.RESOLVED;
    if ((flags & PENDING) !== 0) return AsyncState.PENDING;
    if ((flags & REJECTED) !== 0) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  /**
   * Indicates whether this node or any node in its dependency graph is currently in an error state.
   *
   * Logic: This check is performed untracked to avoid unnecessary subscriptions to the full sub-graph.
   */
  get hasError(): boolean {
    const context = trackingContext.current;
    context?.addDependency(this);

    const flags = this.flags;
    if ((flags & (REJECTED | HAS_ERROR)) !== 0) return true;

    const dependencies = this._deps;
    if (!dependencies.hasComputeds) return false;

    return untracked(() => {
      const length = dependencies.capacity;
      for (let i = 0; i < length; i++) {
        const link = dependencies.at(i);
        if (link?.node.hasError) return true;
      }
      return false;
    });
  }

  /**
   * Convenience helper to determine if the node is free of errors.
   */
  get isValid(): boolean {
    return !this.hasError;
  }

  /**
   * Retrieves an aggregate list of all errors present in the current dependency graph.
   *
   * Reason: Preserves a logical trace of failures across the graph for debugging complex selectors.
   */
  get errors(): readonly Error[] {
    const context = trackingContext.current;
    context?.addDependency(this);

    const selfError = this._error;
    const dependencies = this._deps;

    if (!dependencies.hasComputeds) {
      if (selfError === null) return EMPTY_ERROR_ARRAY;
      return Object.freeze([selfError]);
    }

    const collected: Error[] = [];
    if (selfError !== null) collected.push(selfError);

    untracked(() => {
      const length = dependencies.capacity;
      for (let i = 0; i < length; i++) {
        const link = dependencies.at(i);
        if (link !== null) {
          const dependencyNode = link.node;
          if ((dependencyNode.flags & IS_COMPUTED) !== 0) {
            this._accumulateErrors(
              dependencyNode as unknown as ComputedAtomImpl<unknown>,
              collected
            );
          }
        }
      }
    });

    return collected.length === 0 ? EMPTY_ERROR_ARRAY : Object.freeze(collected);
  }

  private _accumulateErrors(dependency: ComputedAtomImpl<unknown>, collected: Error[]): void {
    const error = dependency._error;
    if (error !== null && !collected.includes(error)) {
      collected.push(error);
    }

    const dependencies = dependency._deps;
    if (!dependencies.hasComputeds) return;

    const length = dependencies.capacity;
    for (let i = 0; i < length; i++) {
      const link = dependencies.at(i);
      if (link !== null) {
        const node = link.node;
        if ((node.flags & IS_COMPUTED) !== 0) {
          this._accumulateErrors(node as unknown as ComputedAtomImpl<unknown>, collected);
        }
      }
    }
  }

  /**
   * Returns the most recent error encountered by this specific node.
   */
  get lastError(): Error | null {
    const context = trackingContext.current;
    context?.addDependency(this);
    return this._error;
  }

  /**
   * Indicates whether an asynchronous computation is currently pending.
   */
  get isPending(): boolean {
    const context = trackingContext.current;
    context?.addDependency(this);
    return (this.flags & PENDING) !== 0;
  }

  /**
   * Indicates whether the computation has successfully resolved at least once.
   */
  get isResolved(): boolean {
    const context = trackingContext.current;
    context?.addDependency(this);
    return (this.flags & RESOLVED) !== 0;
  }

  /**
   * Forces the node to re-evaluate its computation on the next access.
   */
  invalidate(): void {
    this.flags |= FORCE_COMPUTE;
    this._markDirty();
  }

  /**
   * Disposes of the node and releases all dependencies.
   *
   * Logic: Disposed nodes are marked as permanently DIRTY and IDLE to prevent
   * further evaluations.
   */
  dispose(): void {
    const flags = this.flags;
    if ((flags & DISPOSED) !== 0) return;

    this._deps.disposeAll();

    this._slots?.clear();
    this.flags = DISPOSED | DIRTY | IDLE;

    this._error = null;
    this._value = undefined as T;
    this._hotIndex = -1;
  }

  /**
   * Records a dependency on a reactive node during the current tracking cycle.
   *
   * Logic: This method manages the lifecycle of `DependencyLink` objects,
   * supporting O(1) reuse ("claiming") of existing subscriptions to minimize
   * garbage collection pressure and setup overhead.
   *
   * @internal
   */
  addDependency(dependency: Dependency): void {
    const trackEpoch = this._trackEpoch;
    // Constraint: Deduplicate tracking within the same execution epoch.
    if (dependency._lastSeenEpoch === trackEpoch) return;
    dependency._lastSeenEpoch = trackEpoch;

    const trackIndex = this._trackCount++;
    const dependencies = this._deps;

    const existing = dependencies.at(trackIndex);

    if (existing?.node === dependency) {
      existing.version = dependency.version;
    } else if (dependencies.claimExisting(dependency, trackIndex)) {
      // Version and relocation handled inside claimExisting.
    } else {
      const link = new DependencyLink(dependency, dependency.version, dependency.subscribe(this));
      dependencies.insertNew(trackIndex, link);
    }

    if ((dependency.flags & IS_COMPUTED) !== 0) {
      dependencies.hasComputeds = true;
    }
  }

  /**
   * Executes the computation logic and updates internal state.
   *
   * Logic: The method initializes a tracking context, executes the calculation,
   * and handles both synchronous results and asynchronous Promises.
   */
  private _recompute(): void {
    // Constraint: Prevent synchronous re-entrancy via the RECOMPUTING flag.
    if ((this.flags & RECOMPUTING) !== 0) return;
    this.flags = (this.flags | RECOMPUTING) & ~FORCE_COMPUTE;

    this._startTracking();

    try {
      const result = trackingContext.run(this, this._computation);
      this._commitDeps();

      Result.match(result, {
        ok: (val: T | Promise<T>) => {
          if (isPromise(val)) {
            this._handleAsyncComputation(val as Promise<T>);
          } else {
            this._finalizeResolution(val as T);
          }
        },
        err: (e: Error) => {
          this._handleError(e, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, true);
        },
      });
    } finally {
      this._trackEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
      this._trackCount = 0;
      this.flags &= ~RECOMPUTING;
    }
  }

  private _startTracking(): void {
    this._trackEpoch = nextEpoch();
    this._trackCount = 0;
    this._deps.prepareTracking();
    this._hotIndex = -1;
  }

  private _commitDeps(): void {
    try {
      this._deps.truncateFrom(this._trackCount);
    } catch (commitError) {
      if (IS_DEV) {
        console.warn('[atom-effect] _commitDeps failed during error recovery:', commitError);
      }
    }
  }

  /**
   * Manages the lifecycle of an asynchronous computation result.
   *
   * Logic: Implements "async drift" detection. If the dependency graph changes
   * before the promise resolves, or if a new computation is initiated (promiseId change),
   * the result of this operation is discarded.
   */
  private _handleAsyncComputation(promise: Promise<T>): void {
    this.flags = (this.flags | PENDING) & ~(IDLE | DIRTY | RESOLVED | REJECTED);
    this._notifySubscribers(undefined, undefined);

    this._promiseId = (this._promiseId + 1) % COMPUTED_CONFIG.MAX_PROMISE_ID;
    const promiseId = this._promiseId;

    promise.then(
      (result) => {
        if (promiseId !== this._promiseId) return;
        // Logic: Re-validate dependencies before committing. If dirty, a new evaluation is required.
        if (this._isDirty()) return this._markDirty();

        this._finalizeResolution(result);
        this._notifySubscribers(result, undefined);
      },
      (error) =>
        promiseId === this._promiseId &&
        this._handleError(error, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED)
    );
  }

  private _handleError(error: unknown, message: string, shouldThrow = false): void {
    const wrappedError = wrapError(error, ComputedError, message);

    if (!this.isRejected || this._error !== wrappedError) {
      this.version = nextVersion(this.version);
    }

    this._error = wrappedError;
    this.flags = (this.flags & ~(IDLE | DIRTY | PENDING | RESOLVED)) | REJECTED | HAS_ERROR;

    if (this._onError) {
      try {
        this._onError(wrappedError);
      } catch (e) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, e);
      }
    }

    this._notifySubscribers(undefined, undefined);
    if (shouldThrow) throw wrappedError;
  }

  private _finalizeResolution(value: T): void {
    const flags = this.flags;
    // Logic: Version only increments if the new value is different from the cached value.
    if ((flags & RESOLVED) === 0 || !this._equal(this._value, value)) {
      this.version = nextVersion(this.version);
    }

    this._value = value;
    this._error = null;
    this.flags = (flags | RESOLVED) & ~(IDLE | DIRTY | PENDING | REJECTED | HAS_ERROR);
  }

  /**
   * Internal callback for the scheduler.
   * @internal
   */
  execute(): void {
    this._markDirty();
  }

  /**
   * Marks the node as dirty and notifies subscribers.
   * @internal
   */
  _markDirty(): void {
    const flags = this.flags;
    if ((flags & (RECOMPUTING | DIRTY)) !== 0) return;
    this.flags = flags | DIRTY;
    debug.trackUpdate(this.id, debug.getDebugName(this));
    this._notifySubscribers(undefined, undefined);
  }

  /**
   * Performs a deep check of dependency versions to determine if re-evaluation is needed.
   *
   * Optimization: Prioritizes the `_hotIndex` (the dependency that most recently caused a re-evaluation)
   * to provide O(1) dirty detection in high-churn paths.
   */
  protected override _deepDirtyCheck(): boolean {
    const dependencies = this._deps;
    const length = dependencies.length;
    const hotIndex = this._hotIndex;

    return untracked(() => {
      // Logic: Hot-path check.
      if (hotIndex !== -1 && hotIndex < length) {
        const link = dependencies.at(hotIndex);
        if (link && this._checkLinkDirty(link)) return true;
      }

      // Logic: Sequential scan for other dependencies.
      for (let i = 0; i < length; i++) {
        if (i === hotIndex) continue;
        const link = dependencies.at(i);
        if (link && this._checkLinkDirty(link)) {
          this._hotIndex = i;
          return true;
        }
      }

      this._hotIndex = -1;
      return false;
    });
  }

  private _checkLinkDirty(link: DependencyLink): boolean {
    const dependency = link.node;
    // Logic: If the dependency is a computed node, accessing its `value` getter
    // triggers its own internal validation phase.
    if ((dependency.flags & IS_COMPUTED) !== 0) {
      try {
        void (dependency as { value: unknown }).value;
      } catch {
        if (IS_DEV) console.warn(`[atom-effect] Dependency #${dependency.id} threw during check`);
      }
    }
    return dependency.version !== link.version;
  }
}

/**
 * Creates a reactive computation derived from other reactive nodes.
 *
 * When to use:
 * - To define a read-only value that is automatically derived from other atoms or computeds.
 * - To optimize performance by caching expensive calculations, re-evaluating only when dependencies change.
 * - To project or filter raw state into a specific format for UI presentation.
 *
 * @param fn - The calculation logic.
 * @param options - Configuration for custom equality, lazy evaluation, or default values.
 * @returns A read-only reactive computed atom.
 *
 * @example
 * ```typescript
 * import { atom, computed } from '@but212/atom-effect';
 *
 * const count = atom(1);
 * const doubled = computed(() => count.value * 2);
 *
 * console.log(doubled.value); // 2
 * count.value = 5;
 * console.log(doubled.value); // 10
 * ```
 */
export function computed<T>(fn: () => T, options?: ComputedOptions<T>): ComputedAtom<T>;
/**
 * Creates an asynchronous reactive computation.
 *
 * When to use:
 * - When the calculation involves asynchronous operations (e.g., fetch, database queries).
 * - A `defaultValue` is required to provide immediate state before the Promise resolves.
 */
export function computed<T>(
  fn: () => Promise<T>,
  options: ComputedOptions<T> & { defaultValue: T }
): ComputedAtom<T>;
export function computed<T>(
  fn: () => T | Promise<T>,
  options: ComputedOptions<T> = {}
): ComputedAtom<T> {
  return new ComputedAtomImpl(fn, options);
}
