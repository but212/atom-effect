/**
 * @module ComputedNodes
 *
 * Responsibility:
 * Defines derived reactive nodes (`ComputedAtom`) that automatically update
 * based on upstream dependency changes. Manages both synchronous and
 * asynchronous reactive calculations.
 *
 * Design Intent:
 * Implements a pull-based, lazy evaluation strategy to minimize unnecessary
 * computations. Utilizes bitmask state transitions and version-aware resolution
 * to ensure high-performance propagation through the dependency graph.
 */

import { Result, SlotBuffer } from '@but212/atom-effect-utils';
import {
  AsyncState,
  BRAND,
  BrandFlags,
  COMPUTED_STATE_FLAGS,
  DEFAULT_EQUAL,
  EMPTY_ERROR_ARRAY,
  EPOCH_CONSTANTS,
  ERROR_MESSAGES,
  KIND,
  SMI_MAX,
  STATE_MASKS,
} from '@/constants';
import {
  nextVersion,
  nodeCommitDeps,
  nodeGetSubscriberCount,
  nodeHandleError,
  nodeIsDirty,
  nodeIsShallowDirty,
  nodeNotifySubscribers,
  nodeStartTracking,
  nodeSubscribe,
  nodeTrackDependency,
  runInTrackingContext,
  trackingContext,
  untracked,
} from '@/core/base';
import type {
  AsyncStateType,
  ComputedAtom,
  ComputedOptions,
  Dependency,
  DependencyId,
  DependencyLink,
  MergedDependencyValue,
  ReactiveDependencyTracker,
  ReactiveNode,
  ReactiveNodeBase,
  Subscriber,
  SubscriberTarget,
} from '@/types';
import { ComputedError, debug, generateId, mergeAtomValues, NO_DEFAULT_VALUE } from '@/utils';
import { isPromise } from '@/utils/type-guards';
import { BUFFER_FLAGS, disposeAll, isBufferDirty, prepareTracking } from './buffers';

/**
 * Logic: Re-computation Heuristics
 * Validates whether a node requires re-evaluation based on its state flags
 * and the recursive dirty state of its dependency buffer.
 * @internal
 */
export function shouldRecompute(flags: number, tracker: ReactiveDependencyTracker): boolean {
  const asyncState = flags & STATE_MASKS.ASYNC_MASK;
  return (
    (flags & COMPUTED_STATE_FLAGS.FORCE_COMPUTE) !== 0 ||
    asyncState === COMPUTED_STATE_FLAGS.IDLE ||
    isBufferDirty(tracker) ||
    (asyncState === COMPUTED_STATE_FLAGS.RESOLVED && tracker._depSlots.size === 0)
  );
}

/**
 * Logic: Error Collection (Graph Traversal)
 * Iteratively crawls the dependency graph to collect errors while maintaining
 * a visited set to handle potential cycles or diamonds.
 * @internal
 */
function isDependencyTracker(node: unknown): node is ReactiveDependencyTracker {
  return node != null && typeof node === 'object' && '_depSlots' in node;
}

export function collectErrorsRecursive(startNode: ReactiveNodeBase, stopOnFirst: boolean): Error[] {
  const collected: Error[] = [];
  const seen = new Set<number>();

  const walk = (node: ReactiveNodeBase | Dependency): boolean => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);

    if ((node.flags & STATE_MASKS.ASYNC_MASK) === STATE_MASKS.ERROR_MASK) {
      collected.push(
        node._error ?? new Error('Internal Inconsistency: REJECTED flag set but error is null')
      );
      if (stopOnFirst) return true;
    }

    if (isDependencyTracker(node) && (node._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS) !== 0) {
      const slots = node._depSlots;
      const slotsLength = slots.length;
      for (let i = 0; i < slotsLength; i++) {
        const dependencyLink = slots.at(i);
        if (
          dependencyLink &&
          (dependencyLink.node.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0 &&
          walk(dependencyLink.node)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  walk(startNode);
  return collected;
}

/**
 * Role: Implementation of a derived reactive value.
 *
 * Logic: Pull-based lazy evaluation
 * This node only re-computes its value when accessed (if dirty). It tracks
 * upstream dependencies dynamically during execution and supports both
 * synchronous and promise-based computations.
 *
 * @internal
 */
class ComputedAtomImpl<T>
  implements ComputedAtom<T>, Subscriber, ReactiveNode<T>, ReactiveDependencyTracker
{
  // Logic: Engine-exposed state (Public fields for monomorphic performance)
  public flags: number =
    COMPUTED_STATE_FLAGS.IS_COMPUTED | COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
  public version: number = 0;
  public _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  public _nextEpoch: number | undefined = undefined;
  public _trackEpoch: number = 0;
  public _trackCount: number = 0;
  public _error: Error | null = null;
  public _kind: typeof KIND.Obj = KIND.Obj;
  public readonly id: DependencyId = generateId() & SMI_MAX;

  public _subscriberSlots: SlotBuffer<SubscriberTarget<T>> | null = null;
  public _depSlots: SlotBuffer<DependencyLink>;
  public _depFlags: number = BUFFER_FLAGS.NONE;

  /** @internal */
  public readonly [BRAND] = BrandFlags.Atom | BrandFlags.Computed;

  // Logic: Strictly encapsulated state
  #activeSessionId = 0;
  #sessionCounter = 0;

  #value: T;
  #isEqual: (a: T, b: T) => boolean;
  #computationCallback: () => T | Promise<T>;
  #defaultValue: T | typeof NO_DEFAULT_VALUE;
  #onErrorCallback: ((error: Error) => void) | null;

  constructor(computation: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    this._depSlots = new SlotBuffer<DependencyLink>();

    this.#value = undefined as T;

    this.#isEqual = options.equal ?? DEFAULT_EQUAL;
    this.#computationCallback = computation;
    this.#defaultValue = 'defaultValue' in options ? (options.defaultValue as T) : NO_DEFAULT_VALUE;
    this.#onErrorCallback = options.onError ?? null;

    debug.attachDebugInfo(this, 'computed', this.id, options.name);

    if (options.lazy === false) {
      try {
        this.#recompute();
      } catch {
        /* Error handling is performed within #recompute */
      }
    }
  }

  get isDirty(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;
  }
  get isDisposed(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0;
  }
  get isComputed(): boolean {
    return true;
  }
  get isRejected(): boolean {
    trackingContext.current?.addDependency(this);
    return (this.flags & STATE_MASKS.ASYNC_MASK) === COMPUTED_STATE_FLAGS.REJECTED;
  }
  get isRecomputing(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0;
  }

  /**
   * Logic: Pull-based Synchronization
   * Accessing this property validates the entire upstream dependency sub-graph
   * and triggers evaluation if any node has transitioned.
   *
   * Caution: Circular Dependencies & Error Fallback
   * If a node is accessed during its own execution (RECOMPUTING) or is in a failed
   * error state (REJECTED due to sync/async computation failure), it returns
   * the `defaultValue` if provided, otherwise it throws a `ComputedError`.
   */
  get value(): T {
    trackingContext.current?.addDependency(this);

    if (this.#isStable()) return this.#value;

    return Result.unwrap(this.#checkValueState());
  }

  #checkValueState(): Result<T, Error> {
    if (this.isDisposed) {
      return Result.err(new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED));
    }

    const flags = this.flags;
    if (
      (flags & STATE_MASKS.ASYNC_MASK) === COMPUTED_STATE_FLAGS.REJECTED &&
      (flags & COMPUTED_STATE_FLAGS.DIRTY) === 0
    ) {
      return this.#getFallbackOrError(this._error ?? new Error('REJECTED without error'));
    }

    if ((flags & STATE_MASKS.CYCLIC_OR_RECOMPUTING_MASK) !== 0) {
      return this.#getFallbackOrError(
        new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY)
      );
    }

    this.flags = flags | COMPUTED_STATE_FLAGS.CHECKING_DIRTY;
    try {
      if (shouldRecompute(this.flags, this)) {
        this.#recompute();
      } else {
        this.flags &= ~COMPUTED_STATE_FLAGS.DIRTY;
      }
    } finally {
      this.flags &= ~COMPUTED_STATE_FLAGS.CHECKING_DIRTY;
    }

    const nextFlags = this.flags;
    const asyncState = nextFlags & STATE_MASKS.ASYNC_MASK;
    if (asyncState === COMPUTED_STATE_FLAGS.RESOLVED) return Result.ok(this.#value);

    if (asyncState === COMPUTED_STATE_FLAGS.REJECTED) {
      return this.#getFallbackOrError(this._error ?? new Error('REJECTED without error'));
    }

    return this.#getFallbackOrError(
      new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT)
    );
  }

  #getFallbackOrError(error: Error): Result<T, Error> {
    if (this.#defaultValue !== NO_DEFAULT_VALUE) {
      return Result.ok(this.#defaultValue);
    }
    return Result.err(error);
  }

  /**
   * Logic: Stability Optimization
   * A node is stable if it is RESOLVED and not marked as DIRTY or currently
   * undergoing re-computation.
   */
  #isStable(): boolean {
    const STABLE_MASK =
      STATE_MASKS.ASYNC_MASK |
      COMPUTED_STATE_FLAGS.DIRTY |
      COMPUTED_STATE_FLAGS.DISPOSED |
      COMPUTED_STATE_FLAGS.RECOMPUTING;
    return (this.flags & STABLE_MASK) === COMPUTED_STATE_FLAGS.RESOLVED;
  }
  /**
   * Reads the current cached value without triggering reactive tracking.
   */
  peek(): T {
    return this.#value;
  }

  /**
   * Logic: Lifecycle Inspection
   * Registers a dependency and returns the current state of the async lifecycle.
   */
  get state(): AsyncStateType {
    trackingContext.current?.addDependency(this);
    const asyncState = this.flags & STATE_MASKS.ASYNC_MASK;
    if (asyncState === COMPUTED_STATE_FLAGS.RESOLVED) return AsyncState.RESOLVED;
    if (asyncState === COMPUTED_STATE_FLAGS.PENDING) return AsyncState.PENDING;
    if (asyncState === COMPUTED_STATE_FLAGS.REJECTED) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  /**
   * Logic: Silent Error Scan
   * Determines if any node in the upstream graph is in an error state.
   * Optimization: Performed untracked to avoid mass subscription to deep nodes.
   */
  get hasError(): boolean {
    trackingContext.current?.addDependency(this);

    if ((this.flags & STATE_MASKS.ASYNC_MASK) === STATE_MASKS.ERROR_MASK) return true;
    if (!(this._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS)) return false;

    return untracked(() => collectErrorsRecursive(this, true).length > 0);
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  /**
   * Aggregates all errors from the dependency sub-graph into a frozen array.
   */
  get errors(): readonly Error[] {
    trackingContext.current?.addDependency(this);

    if (!(this._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS)) {
      return this._error ? Object.freeze([this._error]) : EMPTY_ERROR_ARRAY;
    }

    return untracked(() => Object.freeze(collectErrorsRecursive(this, false)));
  }

  get lastError(): Error | null {
    trackingContext.current?.addDependency(this);
    return this._error;
  }

  get isPending(): boolean {
    trackingContext.current?.addDependency(this);
    return (this.flags & STATE_MASKS.ASYNC_MASK) === COMPUTED_STATE_FLAGS.PENDING;
  }

  get isResolved(): boolean {
    trackingContext.current?.addDependency(this);
    return (this.flags & STATE_MASKS.ASYNC_MASK) === COMPUTED_STATE_FLAGS.RESOLVED;
  }

  subscribe(listener: SubscriberTarget<T>): () => void {
    return Result.unwrap(nodeSubscribe(this, listener));
  }

  subscriberCount(): number {
    return nodeGetSubscriberCount(this);
  }

  /**
   * Manually flags the node for re-computation on the next access.
   */
  invalidate(): void {
    this.flags |= COMPUTED_STATE_FLAGS.FORCE_COMPUTE;
    this.#markDirty();
  }

  #releaseComputationState(): void {
    this.#computationCallback = () => {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);
    };
    this.#isEqual = DEFAULT_EQUAL;
    this.#defaultValue = NO_DEFAULT_VALUE;
    this.#onErrorCallback = null;
  }

  /**
   * Logic: Resource Teardown
   * Disconnects from all dependencies and releases memory.
   */
  dispose(): void {
    const flags = this.flags;
    if ((flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0) return;

    disposeAll(this);

    this._subscriberSlots?.clear();
    this.#releaseComputationState();
    this.flags =
      COMPUTED_STATE_FLAGS.DISPOSED |
      COMPUTED_STATE_FLAGS.IS_COMPUTED |
      COMPUTED_STATE_FLAGS.DIRTY |
      COMPUTED_STATE_FLAGS.IDLE;

    this._error = null;
  }

  /**
   * Logic: Dependency Integration
   * Captures a dependency during the tracking phase.
   * @internal
   */
  addDependency(dependency: Dependency): void {
    nodeTrackDependency(this, dependency, this);
  }

  /**
   * Logic: Tracked Execution Orchestrator
   * Manages the tracking lifecycle (epoch advance, commit, rollback) during
   * computation execution.
   */
  #recompute(): void {
    // Constraint: Prevent re-entrant synchronous calls.
    if ((this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0) return;

    this.flags =
      (this.flags & ~COMPUTED_STATE_FLAGS.FORCE_COMPUTE) | COMPUTED_STATE_FLAGS.RECOMPUTING;

    try {
      nodeStartTracking(this);
      prepareTracking(this);

      let computedValue: T | Promise<T>;
      try {
        computedValue = runInTrackingContext(trackingContext, this, this.#computationCallback);
      } catch (computationError) {
        if (
          computationError instanceof RangeError ||
          computationError instanceof ReferenceError ||
          computationError instanceof SyntaxError
        ) {
          throw computationError;
        }
        this.#handleError(computationError, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, false);
        return;
      }

      nodeCommitDeps(this);

      if (isPromise(computedValue)) {
        this.#handleAsyncComputation(computedValue);
      } else {
        this.#finalizeResolution(computedValue);
      }
    } finally {
      this.flags &= ~COMPUTED_STATE_FLAGS.RECOMPUTING;
    }
  }

  /**
   * Logic: Async Lifecycle Management
   * Orchestrates Promise resolution using unique session IDs (Drift Detection)
   * to discard results from computation cycles that are no longer valid.
   */
  #handleAsyncComputation(promise: Promise<T>): void {
    this.flags =
      (this.flags & ~(STATE_MASKS.LIFECYCLE_MASK | COMPUTED_STATE_FLAGS.RECOMPUTING)) |
      COMPUTED_STATE_FLAGS.PENDING;
    nodeNotifySubscribers(this, undefined, undefined);

    const flushSessionId = ++this.#sessionCounter;
    this.#activeSessionId = flushSessionId;

    promise.then(
      (result) => {
        if (this.#activeSessionId !== flushSessionId || this.isDisposed) return;

        // Logic: Stale Result Suppression
        // If the node became dirty during the wait, defer resolution.
        if (this.#isDirty()) return this.#markDirty();

        this.#finalizeResolution(result);
        nodeNotifySubscribers(this, result, undefined);
      },
      (error) => {
        if (this.#activeSessionId !== flushSessionId || this.isDisposed) return;
        this.#handleError(error, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);
      }
    );
  }

  #handleError(error: unknown, message: string, shouldThrow = false): void {
    this.flags =
      (this.flags & ~(STATE_MASKS.LIFECYCLE_MASK | COMPUTED_STATE_FLAGS.RECOMPUTING)) |
      COMPUTED_STATE_FLAGS.REJECTED;
    nodeHandleError(this, error, ComputedError, message, this.#onErrorCallback);
    if (shouldThrow) throw this._error;
  }

  /**
   * Logic: Version-Aware Resolution
   * Increments the node's version ONLY if the new value is structurally different
   * (via `_equal`). This prevents unnecessary downstream propagation cascades.
   */
  #finalizeResolution(value: T): void {
    const flags = this.flags;
    const asyncState = flags & STATE_MASKS.ASYNC_MASK;
    if (asyncState !== COMPUTED_STATE_FLAGS.RESOLVED || !this.#isEqual(this.#value, value)) {
      this.version = nextVersion(this.version);
    }

    this.#value = value;
    this._error = null;
    this.flags =
      (flags & ~(STATE_MASKS.LIFECYCLE_MASK | COMPUTED_STATE_FLAGS.RECOMPUTING)) |
      COMPUTED_STATE_FLAGS.RESOLVED;
  }

  /** @internal - Interface for the global scheduler. */
  execute(): void {
    if ((this.flags & (COMPUTED_STATE_FLAGS.RECOMPUTING | COMPUTED_STATE_FLAGS.DIRTY)) !== 0)
      return;
    this.#markDirty();
  }

  /**
   * Optimization: Notification Filtering
   * Marks the node as DIRTY and propagates notifications only if structural
   * changes are detected in dependencies.
   * @internal
   */
  #markDirty(): void {
    const flags = this.flags;

    if (
      (flags & (COMPUTED_STATE_FLAGS.RECOMPUTING | COMPUTED_STATE_FLAGS.DIRTY)) !== 0 ||
      (!(flags & COMPUTED_STATE_FLAGS.FORCE_COMPUTE) && !nodeIsShallowDirty(this))
    ) {
      return;
    }

    this.flags = flags | COMPUTED_STATE_FLAGS.DIRTY;
    debug.trackUpdate(this.id, debug.getDebugName(this));
    nodeNotifySubscribers(this, undefined, undefined);
  }

  #isDirty(): boolean {
    return nodeIsDirty(this);
  }
}

/**
 * Creates a reactive computation derived from other atoms or computed nodes.
 *
 * When to use:
 * - To define values that automatically update when their dependencies change.
 * - To optimize performance through caching of expensive calculations.
 * - To transform or aggregate raw state for UI presentation.
 *
 * @param computationCallback The computation function.
 * @param options Configuration for custom equality checks or error handlers.
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
export function computed<T>(
  computationCallback: () => Promise<T>,
  options: ComputedOptions<T> & { defaultValue: T }
): ComputedAtom<T>;
export function computed<T>(
  computationCallback: () => Promise<T>,
  options?: ComputedOptions<T>
): ComputedAtom<T>;
export function computed<T>(
  computationCallback: () => T,
  options?: ComputedOptions<T>
): ComputedAtom<T>;
export function computed<T>(
  computationCallback: () => T | Promise<T>,
  options: ComputedOptions<T> = {}
): ComputedAtom<T> {
  if (typeof computationCallback !== 'function') {
    throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
  }
  return new ComputedAtomImpl(computationCallback, options);
}

/**
 * Combines multiple object-based atoms into a single computed atom with a flattened type.
 *
 * Logic: Snapshot Aggregation
 * Merges the value types of all input atoms into a single unified object.
 *
 * @param atoms A variadic list of atoms or computed nodes to merge.
 *
 * @example
 * ```typescript
 * import { atom, computed, mergeAtoms } from '@but212/atom-effect';
 *
 * const a = atom({ x: 1 });
 * const b = atom({ y: 2 });
 * const c = computed(() => ({ z: 3 }));
 *
 * const combined = mergeAtoms(a, b, c);
 * // combined.value is { x: number; y: number; z: number }
 * ```
 */
export function mergeAtoms<T extends Dependency<unknown>[]>(
  ...atoms: T
): ComputedAtom<MergedDependencyValue<T>> {
  return computed(() => mergeAtomValues(atoms));
}
