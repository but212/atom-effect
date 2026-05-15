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

import type { SlotBuffer } from '@but212/atom-effect-utils';
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
  nodeHandleError,
  nodeIsDirty,
  nodeIsShallowDirty,
  nodeNotifySubscribers,
  nodeStartTracking,
  nodeSubscribe,
  nodeSubscriberCount,
  nodeTrackDependency,
  rollbackTrackingSubscriber,
  runInTrackingContext,
  trackingContext,
  untracked,
} from '@/core/base';
import type {
  AsyncStateType,
  ComputedAtom,
  ComputedOptions,
  DepBufferState,
  Dependency,
  DependencyId,
  MergedDependencyValue,
  ReactiveNode,
  ReactiveNodeBase,
  Subscriber,
  Subscription,
} from '@/types';
import { ComputedError, debug, generateId, mergeAtomValues, NO_DEFAULT_VALUE } from '@/utils';
import { isPromise } from '@/utils/type-guards';
import {
  BUFFER_FLAGS,
  createDepBuffer,
  disposeAll,
  isBufferDirty,
  prepareTracking,
} from './buffers';

/**
 * Logic: State Transition Descriptors
 * Pure bitmask configurations for atomic state transitions within the engine.
 * @internal
 */
const TRANSITION = {
  TO_RECOMPUTING: {
    clear: COMPUTED_STATE_FLAGS.FORCE_COMPUTE,
    set: COMPUTED_STATE_FLAGS.RECOMPUTING,
  },
  TO_RESOLVED: {
    clear: STATE_MASKS.LIFECYCLE_MASK | COMPUTED_STATE_FLAGS.RECOMPUTING,
    set: COMPUTED_STATE_FLAGS.RESOLVED,
  },
  TO_PENDING: {
    clear: STATE_MASKS.LIFECYCLE_MASK | COMPUTED_STATE_FLAGS.RECOMPUTING,
    set: COMPUTED_STATE_FLAGS.PENDING,
  },
  TO_REJECTED: {
    clear: STATE_MASKS.LIFECYCLE_MASK | COMPUTED_STATE_FLAGS.RECOMPUTING,
    set: COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR,
  },
} as const;

/** @internal - Helper to apply state transitions. */
const apply = (f: number, t: { readonly clear: number; readonly set: number }) =>
  (f & ~t.clear) | t.set;

/**
 * Logic: Result Resolution
 * Determines the final value or error to return based on the node's current
 * lifecycle flags and cached result.
 * @internal
 */
export function resolveComputedResult<T>(
  flags: number,
  value: T,
  error: Error | null,
  defaultValue: T
): T {
  if ((flags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0) return value;

  const hasDefault = defaultValue !== (NO_DEFAULT_VALUE as T);
  const asyncState = flags & STATE_MASKS.ASYNC_UNRESOLVED_MASK;

  // Logic: Synchronous/Resolved fallback
  if (asyncState === 0) return value;

  // Logic: Async Priority Handling
  if (hasDefault) return defaultValue;

  if (asyncState === COMPUTED_STATE_FLAGS.REJECTED) {
    throw error ?? new Error('REJECTED without error');
  }

  throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
}

/**
 * Logic: Re-computation Heuristics
 * Validates whether a node requires re-evaluation based on its state flags
 * and the recursive dirty state of its dependency buffer.
 * @internal
 */
export function shouldRecompute(flags: number, deps: DepBufferState): boolean {
  const isAwaitingAsync = (flags & STATE_MASKS.ASYNC_UNRESOLVED_MASK) !== 0;

  return (
    (flags & STATE_MASKS.COMPUTED_RECOMPUTE_NEEDED_MASK) !== 0 ||
    isBufferDirty(deps) ||
    (!isAwaitingAsync && deps.slots.size === 0)
  );
}

/**
 * Logic: Error Collection (Graph Traversal)
 * Iteratively crawls the dependency graph to collect errors while maintaining
 * a visited set to handle potential cycles or diamonds.
 * @internal
 */
export function collectErrorsRecursive(startNode: ReactiveNodeBase, stopOnFirst: boolean): Error[] {
  const collected: Error[] = [];
  const seen = new Set<number>();

  const walk = (node: ReactiveNodeBase): boolean => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);

    if ((node.flags & STATE_MASKS.ERROR_MASK) !== 0) {
      collected.push(
        node._error ?? new Error('Internal Inconsistency: MASK_ERROR flag set but error is null')
      );
      if (stopOnFirst) return true;
    }

    const deps = node._storage.deps;
    if (deps && (deps.flags & BUFFER_FLAGS.HAS_COMPUTEDS) !== 0) {
      for (let i = 0, len = deps.slots.length; i < len; i++) {
        const link = deps.slots.at(i);
        if (link?.node.isComputed && walk(link.node as unknown as ReactiveNodeBase)) {
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
class ComputedAtomImpl<T> implements ComputedAtom<T>, Subscriber, ReactiveNode<T> {
  // Logic: Engine-exposed state (Public fields for monomorphic performance)
  public flags: number =
    COMPUTED_STATE_FLAGS.IS_COMPUTED | COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
  public version: number = 0;
  public _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  public _nextEpoch: number | undefined = undefined;
  public _trackEpoch: number = 0;
  public _trackCount: number = 0;
  public _error: Error | null = null;
  public _k: typeof KIND.Obj = KIND.Obj;
  public readonly id: DependencyId = generateId() & SMI_MAX;

  public _storage: {
    slots: SlotBuffer<Subscription<T>> | null;
    deps: DepBufferState | null;
  } = {
    slots: null,
    deps: createDepBuffer(),
  };

  /** @internal */
  public readonly [BRAND] = BrandFlags.Atom | BrandFlags.Computed;

  // Logic: Strictly encapsulated state
  #activeSessionId = 0;
  #sessionCounter = 0;

  #value: T;
  #equal: (a: T, b: T) => boolean;
  #computation: () => T | Promise<T>;
  #defaultValue: T;
  #onError: ((error: Error) => void) | null;
  #notifyCallback: () => void;

  constructor(computation: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof computation !== 'function')
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);

    this.#value = undefined as T;

    this.#equal = options.equal ?? DEFAULT_EQUAL;
    this.#computation = computation;
    this.#defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this.#onError = options.onError ?? null;
    this.#notifyCallback = this.execute.bind(this);

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
    return (this.flags & COMPUTED_STATE_FLAGS.REJECTED) !== 0;
  }
  get isRecomputing(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0;
  }

  /**
   * Logic: Pull-based Synchronization
   * Accessing this property validates the entire upstream dependency sub-graph
   * and triggers evaluation if any node has transitioned.
   *
   * Caution: Circular Dependencies
   * If a node is accessed during its own execution (RECOMPUTING), it returns
   * the `defaultValue` if provided, otherwise it throws a `ComputedError`.
   */
  get value(): T {
    trackingContext.current?.addDependency(this);

    if (this.#isStable()) return this.#value;

    this.#ensureNotDisposed();

    if ((this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0) {
      if (this.#defaultValue !== (NO_DEFAULT_VALUE as T)) return this.#defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if (shouldRecompute(this.flags, this._storage.deps!)) {
      this.#recompute();
    } else {
      this.flags &= ~COMPUTED_STATE_FLAGS.DIRTY;
    }

    return resolveComputedResult(this.flags, this.#value, this._error, this.#defaultValue);
  }

  /**
   * Logic: Stability Optimization
   * A node is stable if it is RESOLVED and not marked as DIRTY or currently
   * undergoing re-computation.
   */
  #isStable(): boolean {
    const STABLE_MASK =
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.DIRTY |
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.DISPOSED |
      COMPUTED_STATE_FLAGS.RECOMPUTING;
    return (this.flags & STABLE_MASK) === COMPUTED_STATE_FLAGS.RESOLVED;
  }

  #ensureNotDisposed(): void {
    if ((this.flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0)
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);
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
    const flags = this.flags;
    if ((flags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0) return AsyncState.RESOLVED;
    if ((flags & COMPUTED_STATE_FLAGS.PENDING) !== 0) return AsyncState.PENDING;
    if ((flags & COMPUTED_STATE_FLAGS.REJECTED) !== 0) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  /**
   * Logic: Silent Error Scan
   * Determines if any node in the upstream graph is in an error state.
   * Optimization: Performed untracked to avoid mass subscription to deep nodes.
   */
  get hasError(): boolean {
    trackingContext.current?.addDependency(this);

    if ((this.flags & STATE_MASKS.ERROR_MASK) !== 0) return true;
    if (!(this._storage.deps!.flags & BUFFER_FLAGS.HAS_COMPUTEDS)) return false;

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

    if (!(this._storage.deps!.flags & BUFFER_FLAGS.HAS_COMPUTEDS)) {
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
    return (this.flags & COMPUTED_STATE_FLAGS.PENDING) !== 0;
  }

  get isResolved(): boolean {
    trackingContext.current?.addDependency(this);
    return (this.flags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0;
  }

  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    return nodeSubscribe(this, listener);
  }

  subscriberCount(): number {
    return nodeSubscriberCount(this);
  }

  /**
   * Manually flags the node for re-computation on the next access.
   */
  invalidate(): void {
    this.flags |= COMPUTED_STATE_FLAGS.FORCE_COMPUTE;
    this.#markDirty();
  }

  /**
   * Logic: Resource Teardown
   * Disconnects from all dependencies and releases memory.
   */
  dispose(): void {
    const flags = this.flags;
    if ((flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0) return;

    disposeAll(this._storage.deps!);

    this._storage.slots?.clear();
    this.flags =
      COMPUTED_STATE_FLAGS.DISPOSED | COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;

    this._error = null;
    this.#value = undefined as T;
  }

  /**
   * Logic: Dependency Integration
   * Captures a dependency during the tracking phase.
   * @internal
   */
  addDependency(dependency: Dependency): void {
    nodeTrackDependency(this, dependency, this.#notifyCallback);
  }

  /**
   * Logic: Tracked Execution Orchestrator
   * Manages the tracking lifecycle (epoch advance, commit, rollback) during
   * computation execution.
   */
  #recompute(): void {
    // Constraint: Prevent re-entrant synchronous calls.
    if ((this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0) return;

    this.flags = apply(this.flags, TRANSITION.TO_RECOMPUTING);
    const prevDepth = trackingContext.stack.length;

    nodeStartTracking(this);
    prepareTracking(this._storage.deps!);

    let val: T | Promise<T> | undefined;
    let hasError = false;
    let errorToThrow: unknown;

    try {
      val = runInTrackingContext(trackingContext, this, this.#computation);
    } catch (e) {
      // Impact: Preserves tracking context integrity if the computation fails.
      rollbackTrackingSubscriber(trackingContext, prevDepth);
      hasError = true;
      errorToThrow = e;
    }

    nodeCommitDeps(this);

    if (hasError) {
      this.#handleError(errorToThrow, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, false);
    } else if (isPromise(val!)) {
      this.#handleAsyncComputation(val as Promise<T>);
    } else {
      this.#finalizeResolution(val as T);
    }

    this.flags &= ~COMPUTED_STATE_FLAGS.RECOMPUTING;
  }

  /**
   * Logic: Async Lifecycle Management
   * Orchestrates Promise resolution using unique session IDs (Drift Detection)
   * to discard results from computation cycles that are no longer valid.
   */
  #handleAsyncComputation(promise: Promise<T>): void {
    this.flags = apply(this.flags, TRANSITION.TO_PENDING);
    nodeNotifySubscribers(this, undefined, undefined);

    const sessionId = ++this.#sessionCounter;
    this.#activeSessionId = sessionId;

    promise.then(
      (result) => {
        if (this.#activeSessionId !== sessionId) return;

        // Logic: Stale Result Suppression
        // If the node became dirty during the wait, defer resolution.
        if (this.#isDirty()) return this.#markDirty();

        this.#finalizeResolution(result);
        nodeNotifySubscribers(this, result, undefined);
      },
      (error) => {
        if (this.#activeSessionId !== sessionId) return;
        this.#handleError(error, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);
      }
    );
  }

  #handleError(error: unknown, message: string, shouldThrow = false): void {
    nodeHandleError(this, error, ComputedError, message, this.#onError);
    this.flags = apply(this.flags, TRANSITION.TO_REJECTED);
    if (shouldThrow) throw this._error;
  }

  /**
   * Logic: Version-Aware Resolution
   * Increments the node's version ONLY if the new value is structurally different
   * (via `_equal`). This prevents unnecessary downstream propagation cascades.
   */
  #finalizeResolution(value: T): void {
    const flags = this.flags;
    if ((flags & COMPUTED_STATE_FLAGS.RESOLVED) === 0 || !this.#equal(this.#value, value)) {
      this.version = nextVersion(this.version);
    }

    this.#value = value;
    this._error = null;
    this.flags = apply(this.flags, TRANSITION.TO_RESOLVED);
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
 * @param fn - The computation function.
 * @param options - Configuration for custom equality checks or error handlers.
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
 * - For logic involving fetch, database queries, or long-running tasks.
 *
 * Attention:
 * A `defaultValue` is mandatory for async computations to provide a valid
 * state while the Promise is PENDING.
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

/**
 * Combines multiple object-based atoms into a single computed atom with a flattened type.
 *
 * Logic: Snapshot Aggregation
 * Merges the value types of all input atoms into a single unified object.
 *
 * @param atoms - A variadic list of atoms or computed nodes to merge.
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
