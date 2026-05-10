import type { SlotBuffer } from '@but212/atom-effect-utils';
import {
  AsyncState,
  BRAND,
  BrandFlags,
  COMPUTED_STATE_FLAGS,
  DEFAULT_EQUAL,
  EMPTY_ERROR_ARRAY,
  EPOCH_CONSTANTS,
  KIND,
  SMI_MAX,
  STATE_MASKS,
} from '@/constants';
import {
  nextVersion,
  nodeCommitDeps,
  nodeHandleError,
  nodeIsDirty,
  nodeIsDisposed,
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
  Subscriber,
  Subscription,
} from '@/types';
import {
  ComputedError,
  debug,
  ERROR_MESSAGES,
  generateId,
  mergeAtomValues,
  NO_DEFAULT_VALUE,
} from '@/utils';
import { isPromise } from '@/utils/type-guards';
import { createDepBuffer, disposeAll, isBufferDirty, prepareTracking } from './buffers';

/**
 * Logic: Pragmatic Physics Transitions
 * Pure bitmask descriptors for state transitions.
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

/** @internal */
const apply = (f: number, t: { readonly clear: number; readonly set: number }) =>
  (f & ~t.clear) | t.set;

/**
 * Logic: Computed Result Resolution
 * Determines the final value or error to return based on current flags and cache.
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

  // Terminal/Non-async fallback
  if (asyncState === 0) return value;

  // Async handling priority
  if (hasDefault) return defaultValue;

  if (asyncState === COMPUTED_STATE_FLAGS.REJECTED) {
    throw error ?? new Error('REJECTED without error');
  }

  throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
}

/**
 * Logic: Re-computation Heuristics
 * Determines if a node requires re-evaluation based on its state and dependencies.
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

/** @internal */
interface InternalComputedNode {
  readonly id: number;
  readonly flags: number;
  readonly lastError: Error | null;
  readonly _storage: {
    deps: DepBufferState | null;
  };
}

/**
 * Logic: Iterative Graph Traversal
 * Crawls the dependency graph to collect errors.
 * @internal
 */
export function collectErrorsRecursive(
  startNode: InternalComputedNode,
  stopOnFirst: boolean
): Error[] {
  const collected: Error[] = [];
  const seen = new Set<number>();

  const walk = (node: InternalComputedNode): boolean => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);

    if ((node.flags & STATE_MASKS.ERROR_MASK) !== 0) {
      collected.push(
        node.lastError ?? new Error('Internal Inconsistency: MASK_ERROR flag set but error is null')
      );
      if (stopOnFirst) return true;
    }

    const deps = node._storage.deps;
    if (deps?.hasComputeds) {
      for (let i = 0, len = deps.slots.length; i < len; i++) {
        const link = deps.slots.at(i);
        if (link?.node.isComputed && walk(link.node as unknown as InternalComputedNode)) {
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
 * Implementation of a derived reactive value.
 * @internal
 */
class ComputedAtomImpl<T> implements ComputedAtom<T>, Subscriber, ReactiveNode<T> {
  // ReactiveNode implementation
  flags: number =
    COMPUTED_STATE_FLAGS.IS_COMPUTED | COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
  version: number = 0;
  _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  _nextEpoch: number | undefined = undefined;
  _k: typeof KIND.Obj = KIND.Obj;
  readonly id: DependencyId = generateId() & SMI_MAX;
  _storage: {
    slots: SlotBuffer<Subscription<T>> | null;
    deps: DepBufferState | null;
  } = {
    slots: null,
    deps: createDepBuffer(),
  };

  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Computed;

  /** @internal */
  private _activeSessionId = 0;
  private _sessionCounter = 0;

  private _value: T;
  private _error: Error | null = null;

  private readonly _equal: (a: T, b: T) => boolean;
  private readonly _computation: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _onError: ((error: Error) => void) | null;
  private readonly _notifyCallback: () => void;

  constructor(computation: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof computation !== 'function')
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);

    this._value = undefined as T;

    this._equal = options.equal ?? DEFAULT_EQUAL;
    this._computation = computation;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;
    this._notifyCallback = this.execute.bind(this);

    debug.attachDebugInfo(this, 'computed', this.id, options.name);

    if (options.lazy === false) {
      try {
        this._recompute();
      } catch {
        /* Error handling is isolated within _recompute */
      }
    }
  }

  get isDirty(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;
  }

  get isDisposed(): boolean {
    return nodeIsDisposed(this);
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
   * Accesses the current value, triggering lazy evaluation if necessary.
   *
   * Logic: Pull-based Refresh
   * Accessing this property validates the entire dependency sub-graph.
   *
   * Caution: Circular Dependency
   * If a computed node is accessed during its own execution (RECOMPUTING),
   * it will either return a default value or throw a `ComputedError`.
   */
  get value(): T {
    trackingContext.current?.addDependency(this);

    if (this._isStable()) return this._value;

    this._ensureNotDisposed();

    if ((this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0) {
      if (this._defaultValue !== (NO_DEFAULT_VALUE as T)) return this._defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if (shouldRecompute(this.flags, this._storage.deps!)) {
      this._recompute();
    } else {
      this.flags &= ~COMPUTED_STATE_FLAGS.DIRTY;
    }

    return resolveComputedResult(this.flags, this._value, this._error, this._defaultValue);
  }

  /**
   * Logic: Stability Guard
   * A node is stable if it is RESOLVED and not marked DIRTY or currently computing.
   */
  private _isStable(): boolean {
    const STABLE_MASK =
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.DIRTY |
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.DISPOSED |
      COMPUTED_STATE_FLAGS.RECOMPUTING;
    return (this.flags & STABLE_MASK) === COMPUTED_STATE_FLAGS.RESOLVED;
  }

  private _ensureNotDisposed(): void {
    if ((this.flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0)
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);
  }

  /**
   * Reads the current cached value without triggering evaluation.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Returns the current lifecycle phase (IDLE, PENDING, RESOLVED, REJECTED).
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
   * Logic: Untracked Deep Scan
   * Checks if any node in the dependency graph is in an error state.
   * Performed untracked to avoid creating excessive subscriptions to deep nodes.
   */
  get hasError(): boolean {
    trackingContext.current?.addDependency(this);

    if ((this.flags & STATE_MASKS.ERROR_MASK) !== 0) return true;
    if (!this._storage.deps!.hasComputeds) return false;

    return untracked(() => collectErrorsRecursive(this, true).length > 0);
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  /**
   * Collects all errors from the dependency sub-graph into a frozen array.
   */
  get errors(): readonly Error[] {
    trackingContext.current?.addDependency(this);

    if (!this._storage.deps!.hasComputeds) {
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
   * Manually flags the node for re-computation.
   */
  invalidate(): void {
    this.flags |= COMPUTED_STATE_FLAGS.FORCE_COMPUTE;
    this._markDirty();
  }

  /**
   * Releases resources and marks the node as permanently inactive.
   * Logic: Disposed nodes enter a terminal DIRTY state.
   */
  dispose(): void {
    const flags = this.flags;
    if ((flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0) return;

    disposeAll(this._storage.deps!);

    this._storage.slots?.clear();
    this.flags =
      COMPUTED_STATE_FLAGS.DISPOSED | COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;

    this._error = null;
    this._value = undefined as T;
  }

  /**
   * Logic: Subscription Reconciliation
   * Captures dependencies during the tracking phase. Reuses existing
   * subscription links (O(1) in the buffer) to minimize DOM/event thrashing.
   * @internal
   */
  addDependency(dependency: Dependency): void {
    nodeTrackDependency(this, dependency, this._notifyCallback);
  }

  /**
   * Logic: Tracked Execution Orchestrator
   * Wraps the computation in a tracking context to capture dependencies.
   */
  private _recompute(): void {
    // Constraint: Prevent synchronous re-entrancy.
    if ((this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0) return;

    this.flags = apply(this.flags, TRANSITION.TO_RECOMPUTING);
    const prevDepth = trackingContext.stack.length;

    nodeStartTracking(this);
    prepareTracking(this._storage.deps!);

    let val: T | Promise<T> | undefined;
    let hasError = false;
    let errorToThrow: unknown;

    try {
      try {
        val = runInTrackingContext(trackingContext, this, this._computation);
      } catch (e) {
        rollbackTrackingSubscriber(trackingContext, prevDepth);
        throw e;
      }
    } catch (e) {
      hasError = true;
      errorToThrow = e;
    }

    nodeCommitDeps(this);

    if (hasError) {
      this._handleError(errorToThrow, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, false);
    } else if (isPromise(val!)) {
      this._handleAsyncComputation(val as Promise<T>);
    } else {
      this._finalizeResolution(val as T);
    }

    this.flags &= ~COMPUTED_STATE_FLAGS.RECOMPUTING;
  }

  /**
   * Logic: Async Session Management
   * Orchestrates Promise resolution. Uses unique session IDs to discard
   * results from invalidated computations (Drift Detection).
   */
  private _handleAsyncComputation(promise: Promise<T>): void {
    this.flags = apply(this.flags, TRANSITION.TO_PENDING);
    nodeNotifySubscribers(this, undefined, undefined);

    const sessionId = ++this._sessionCounter;
    this._activeSessionId = sessionId;

    promise.then(
      (result) => {
        if (this._activeSessionId !== sessionId) return;

        // Constraint: If the node became dirty during the async wait,
        // defer resolution until the next read.
        if (this._isDirty()) return this._markDirty();

        this._finalizeResolution(result);
        nodeNotifySubscribers(this, result, undefined);
      },
      (error) => {
        if (this._activeSessionId !== sessionId) return;
        this._handleError(error, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);
      }
    );
  }

  private _handleError(error: unknown, message: string, shouldThrow = false): void {
    nodeHandleError(this, error, ComputedError, message, this._onError);
    this.flags = apply(this.flags, TRANSITION.TO_REJECTED);
    if (shouldThrow) throw this._error;
  }

  /**
   * Logic: Version-Aware Resolution
   * Increments the node's version ONLY if the new value is structurally
   * different (via `_equal`). This prevents unnecessary downstream re-computes.
   */
  private _finalizeResolution(value: T): void {
    const flags = this.flags;
    if ((flags & COMPUTED_STATE_FLAGS.RESOLVED) === 0 || !this._equal(this._value, value)) {
      this.version = nextVersion(this.version);
    }

    this._value = value;
    this._error = null;
    this.flags = apply(this.flags, TRANSITION.TO_RESOLVED);
  }

  /**
   * Implementation of the Subscriber interface for the global scheduler.
   * @internal
   */
  execute(): void {
    if ((this.flags & (COMPUTED_STATE_FLAGS.RECOMPUTING | COMPUTED_STATE_FLAGS.DIRTY)) !== 0)
      return;
    this._markDirty();
  }

  /**
   * Marks the node as DIRTY and propagates the notification to dependents.
   * @internal
   */
  _markDirty(): void {
    const flags = this.flags;

    // 1. Check if we need to filter the notification
    // Optimization: Only perform O(N) check if we have subscribers to notify
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

  private _isDirty(): boolean {
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
 * @example
 * ```typescript
 * const count = atom(1);
 * const doubled = computed(() => count.value * 2);
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
 *
 * @example
 * ```typescript
 * const user = computed(
 *   async () => fetchUser(userId.value),
 *   { defaultValue: null }
 * );
 * ```
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
 * This utility merges the value types of all input atoms into a single
 * unified object type using the {@link Merge} utility.
 *
 * @param atoms - A variadic list of atoms or computed nodes to merge.
 *
 * @example
 * ```typescript
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
