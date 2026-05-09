import {
  AsyncState,
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
  MergedDependencyValue,
  Subscriber,
} from '@/types';
import { debug, mergeAtomValues, NO_DEFAULT_VALUE } from '@/utils';
import { isPromise } from '@/utils/type-guards';
import {
  claimExisting,
  createDepBuffer,
  type DepBufferState,
  depBufferTruncateFrom,
  disposeAll,
  insertNew,
  isBufferDirty,
  prepareTracking,
} from './buffers';
import { nextEpoch, nextVersion } from './scheduler';
import {
  createDependencyLink,
  rollbackTrackingSubscriber,
  runInTrackingContext,
  trackingContext,
  untracked,
} from './tracking';

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

const MASK_UNRESOLVED_ASYNC = PENDING | REJECTED;
const PATTERN_RECOMPUTE_NEEDED = IDLE | FORCE_COMPUTE;
const MASK_ERROR = REJECTED | HAS_ERROR;
const MASK_LIFECYCLE = IDLE | DIRTY | PENDING | RESOLVED | REJECTED | HAS_ERROR;

/**
 * Logic: Pragmatic Physics Transitions
 * Pure bitmask descriptors for state transitions.
 * @internal
 */
const TRANSITION = {
  TO_RECOMPUTING: { clear: FORCE_COMPUTE, set: RECOMPUTING },
  TO_RESOLVED: { clear: MASK_LIFECYCLE | RECOMPUTING, set: RESOLVED },
  TO_PENDING: { clear: MASK_LIFECYCLE | RECOMPUTING, set: PENDING },
  TO_REJECTED: { clear: MASK_LIFECYCLE | RECOMPUTING, set: REJECTED | HAS_ERROR },
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
  if ((flags & RESOLVED) !== 0) return value;

  const hasDefault = defaultValue !== (NO_DEFAULT_VALUE as T);
  const asyncState = flags & MASK_UNRESOLVED_ASYNC;

  // Terminal/Non-async fallback
  if (asyncState === 0) return value;

  // Async handling priority
  if (hasDefault) return defaultValue;

  if (asyncState === REJECTED) {
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
  const isAwaitingAsync = (flags & MASK_UNRESOLVED_ASYNC) !== 0;

  return (
    (flags & PATTERN_RECOMPUTE_NEEDED) !== 0 ||
    isBufferDirty(deps) ||
    (!isAwaitingAsync && deps.slots.size === 0)
  );
}

/** @internal */
interface InternalComputedNode {
  readonly id: number;
  readonly flags: number;
  readonly lastError: Error | null;
  readonly _deps: DepBufferState | null;
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

    if ((node.flags & MASK_ERROR) !== 0) {
      collected.push(
        node.lastError ?? new Error('Internal Inconsistency: MASK_ERROR flag set but error is null')
      );
      if (stopOnFirst) return true;
    }

    const deps = node._deps;
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
class ComputedAtomImpl<T> extends ReactiveNode<T> implements ComputedAtom<T>, Subscriber {
  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Computed;

  /** @internal */
  private _activeSessionId = 0;
  private _sessionCounter = 0;

  /** @internal */
  private _trackEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  /** @internal */
  private _trackCount = 0;

  private _value: T;
  private _error: Error | null = null;

  /**
   * Internal dependency buffer managing subscription reconciliation.
   * @internal
   */
  _deps = createDepBuffer();

  private readonly _equal: (a: T, b: T) => boolean;
  private readonly _computation: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _onError: ((error: Error) => void) | null;

  constructor(computation: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof computation !== 'function')
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    super();

    this._value = undefined as T;
    // Initial State: Dirty and Idle to force evaluation on first access.
    this.flags = IS_COMPUTED | DIRTY | IDLE;
    this._equal = options.equal ?? Object.is;
    this._computation = computation;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;

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
    return (this.flags & DIRTY) !== 0;
  }

  get isRejected(): boolean {
    return (this.flags & REJECTED) !== 0;
  }

  get isRecomputing(): boolean {
    return (this.flags & RECOMPUTING) !== 0;
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

    if ((this.flags & RECOMPUTING) !== 0) {
      if (this._defaultValue !== (NO_DEFAULT_VALUE as T)) return this._defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if (shouldRecompute(this.flags, this._deps)) {
      this._recompute();
    } else {
      this.flags &= ~DIRTY;
    }

    return resolveComputedResult(this.flags, this._value, this._error, this._defaultValue);
  }

  /**
   * Logic: Stability Guard
   * A node is stable if it is RESOLVED and not marked DIRTY or currently computing.
   */
  private _isStable(): boolean {
    const STABLE_MASK = RESOLVED | DIRTY | IDLE | DISPOSED | RECOMPUTING;
    return (this.flags & STABLE_MASK) === RESOLVED;
  }

  private _ensureNotDisposed(): void {
    if ((this.flags & DISPOSED) !== 0) throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);
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
    if ((flags & RESOLVED) !== 0) return AsyncState.RESOLVED;
    if ((flags & PENDING) !== 0) return AsyncState.PENDING;
    if ((flags & REJECTED) !== 0) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  /**
   * Logic: Untracked Deep Scan
   * Checks if any node in the dependency graph is in an error state.
   * Performed untracked to avoid creating excessive subscriptions to deep nodes.
   */
  get hasError(): boolean {
    trackingContext.current?.addDependency(this);

    if ((this.flags & MASK_ERROR) !== 0) return true;
    if (!this._deps.hasComputeds) return false;

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

    if (!this._deps.hasComputeds) {
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
    return (this.flags & PENDING) !== 0;
  }

  get isResolved(): boolean {
    trackingContext.current?.addDependency(this);
    return (this.flags & RESOLVED) !== 0;
  }

  /**
   * Manually flags the node for re-computation.
   */
  invalidate(): void {
    this.flags |= FORCE_COMPUTE;
    this._markDirty();
  }

  /**
   * Releases resources and marks the node as permanently inactive.
   * Logic: Disposed nodes enter a terminal DIRTY state.
   */
  dispose(): void {
    const flags = this.flags;
    if ((flags & DISPOSED) !== 0) return;

    disposeAll(this._deps);

    this._slots?.clear();
    this.flags = DISPOSED | DIRTY | IDLE;

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
    const trackEpoch = this._trackEpoch;
    // Optimization: Deduplicate tracking within the same execution epoch.
    if (dependency._lastSeenEpoch === trackEpoch) return;
    dependency._lastSeenEpoch = trackEpoch;

    const trackIndex = this._trackCount++;
    const dependencies = this._deps;

    const existing = dependencies.slots.at(trackIndex);

    if (existing?.node === dependency) {
      existing.version = dependency.version;
    } else if (!claimExisting(dependencies, dependency, trackIndex)) {
      const link = createDependencyLink(dependency, dependency.version, dependency.subscribe(this));
      insertNew(dependencies, trackIndex, link);
    }

    if ((dependency.flags & IS_COMPUTED) !== 0) {
      dependencies.hasComputeds = true;
    }
  }

  /**
   * Logic: Tracked Execution Orchestrator
   * Wraps the computation in a tracking context to capture dependencies.
   */
  private _recompute(): void {
    // Constraint: Prevent synchronous re-entrancy.
    if ((this.flags & RECOMPUTING) !== 0) return;

    this.flags = apply(this.flags, TRANSITION.TO_RECOMPUTING);
    const prevDepth = trackingContext.stack.length;

    this._startTracking();

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

    if (hasError) {
      this._commitDeps();
      this._handleError(errorToThrow, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, false);
    } else {
      this._commitDeps();
      if (isPromise(val!)) {
        this._handleAsyncComputation(val as Promise<T>);
      } else {
        this._finalizeResolution(val as T);
      }
    }

    this._trackEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
    this._trackCount = 0;
    this.flags &= ~RECOMPUTING;
  }

  private _startTracking(): void {
    this._trackEpoch = nextEpoch();
    this._trackCount = 0;
    prepareTracking(this._deps);
  }

  private _commitDeps(): void {
    try {
      depBufferTruncateFrom(this._deps, this._trackCount);
    } catch (commitError) {
      if (IS_DEV) {
        console.warn('[atom-effect] _commitDeps failed during error recovery:', commitError);
      }
    }
  }

  /**
   * Logic: Async Session Management
   * Orchestrates Promise resolution. Uses unique session IDs to discard
   * results from invalidated computations (Drift Detection).
   */
  private _handleAsyncComputation(promise: Promise<T>): void {
    this.flags = apply(this.flags, TRANSITION.TO_PENDING);
    this._notifySubscribers(undefined, undefined);

    const sessionId = ++this._sessionCounter;
    this._activeSessionId = sessionId;

    promise.then(
      (result) => {
        if (this._activeSessionId !== sessionId) return;

        // Constraint: If the node became dirty during the async wait,
        // defer resolution until the next read.
        if (this._isDirty()) return this._markDirty();

        this._finalizeResolution(result);
        this._notifySubscribers(result, undefined);
      },
      (error) => {
        if (this._activeSessionId !== sessionId) return;
        this._handleError(error, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);
      }
    );
  }

  private _handleError(error: unknown, message: string, shouldThrow = false): void {
    const wrappedError = wrapError(error, ComputedError, message);

    const oldError = this._error;
    if (!this.isRejected || oldError !== wrappedError) {
      this.version = nextVersion(this.version);
    }

    this._error = wrappedError;
    this.flags = apply(this.flags, TRANSITION.TO_REJECTED);

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

  /**
   * Logic: Version-Aware Resolution
   * Increments the node's version ONLY if the new value is structurally
   * different (via `_equal`). This prevents unnecessary downstream re-computes.
   */
  private _finalizeResolution(value: T): void {
    const flags = this.flags;
    if ((flags & RESOLVED) === 0 || !this._equal(this._value, value)) {
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
    this._markDirty();
  }

  /**
   * Marks the node as DIRTY and propagates the notification to dependents.
   * @internal
   */
  _markDirty(): void {
    const flags = this.flags;
    // 1. Already recomputing or marked dirty (prevent redundant propagation)
    // 2. OR (Not forced to compute AND no changes detected in dependencies)
    if (
      (flags & (RECOMPUTING | DIRTY)) !== 0 ||
      (!(flags & FORCE_COMPUTE) && !this._isShallowDirty())
    ) {
      return;
    }

    this.flags = flags | DIRTY;
    debug.trackUpdate(this.id, debug.getDebugName(this));
    this._notifySubscribers(undefined, undefined);
  }

  /** @internal */
  protected override _deepDirtyCheck(): boolean {
    return isBufferDirty(this._deps);
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
