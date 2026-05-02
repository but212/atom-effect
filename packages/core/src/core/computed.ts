import { Result } from '@but212/atom-effect-utils';
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
  Subscriber,
} from '@/types';
import { debug, NO_DEFAULT_VALUE } from '@/utils/debug';
import { isPromise } from '@/utils/type-guards';
import {
  claimExisting,
  createDepBuffer,
  depBufferTruncateFrom,
  disposeAll,
  insertNew,
  isBufferDirty,
  prepareTracking,
} from './buffers';
import { nextEpoch, nextVersion } from './scheduler';
import { createDependencyLink, trackingContext, untracked } from './tracking';

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
 * Uses direct bitwise operations to transition the lifecycle state as data.
 * This ensures O(1) state management during high-frequency execution cycles.
 * @internal
 */
const TRANSITIONS = {
  TO_RECOMPUTING: (f: number) => (f | RECOMPUTING) & ~FORCE_COMPUTE,
  TO_RESOLVED: (f: number) => (f & ~MASK_LIFECYCLE) | RESOLVED,
  TO_PENDING: (f: number) => (f & ~MASK_LIFECYCLE) | PENDING,
  TO_REJECTED: (f: number) => (f & ~MASK_LIFECYCLE) | REJECTED | HAS_ERROR,
} as const;

/**
 * Implementation of a derived reactive value.
 * @internal
 */
class ComputedAtomImpl<T> extends ReactiveNode<T> implements ComputedAtom<T>, Subscriber {
  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Computed;

  /**
   * Logic: Async Drift Detection
   * Stores the current async session. Promises that resolve from a previous
   * session (stale) are ignored to prevent race conditions.
   * @internal
   */
  private _session: { id: number; promise: Promise<T> } | null = null;
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

    if (this._needsRecompute()) {
      this._recompute();
    } else {
      this.flags &= ~DIRTY;
    }

    return this._resolveValue();
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
   * Logic: Re-computation Heuristics
   *
   * Constraint: Async Isolation
   * Async nodes in terminal states (PENDING/REJECTED) must not re-trigger
   * solely because they have no tracked dependencies (common in fetch nodes).
   */
  private _needsRecompute(): boolean {
    const flags = this.flags;
    const isAwaitingAsync = (flags & (PENDING | REJECTED)) !== 0;
    if (isAwaitingAsync) {
      return (flags & PATTERN_RECOMPUTE_NEEDED) !== 0 || isBufferDirty(this._deps);
    }
    return (
      (flags & PATTERN_RECOMPUTE_NEEDED) !== 0 ||
      this._deps.slots.length === 0 ||
      isBufferDirty(this._deps)
    );
  }

  /**
   * Logic: Value Resolution Priority
   * 1. If RESOLVED, return cached value.
   * 2. If PENDING/REJECTED and a defaultValue exists, return it.
   * 3. If REJECTED and no defaultValue, throw the captured error.
   */
  private _resolveValue(): T {
    const { flags } = this;

    if ((flags & RESOLVED) !== 0) return this._value;

    const hasDefault = this._defaultValue !== (NO_DEFAULT_VALUE as T);

    if ((flags & MASK_UNRESOLVED_ASYNC) !== 0) {
      if (hasDefault) return this._defaultValue;
      if ((flags & REJECTED) !== 0) throw this._error!;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
    }

    return this._value;
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
    const context = trackingContext.current;
    context?.addDependency(this);
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
    const context = trackingContext.current;
    context?.addDependency(this);

    if ((this.flags & MASK_ERROR) !== 0) return true;
    if (!this._deps.hasComputeds) return false;

    return untracked(() => this._collectErrors(true).length > 0);
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  /**
   * Collects all errors from the dependency sub-graph into a frozen array.
   */
  get errors(): readonly Error[] {
    const context = trackingContext.current;
    context?.addDependency(this);

    if (!this._deps.hasComputeds) {
      return this._error === null ? EMPTY_ERROR_ARRAY : Object.freeze([this._error]);
    }

    return untracked(() => Object.freeze(this._collectErrors(false)));
  }

  /**
   * Logic: Iterative Graph Traversal
   * Safely crawls the dependency graph to collect errors without risking
   * stack overflow on deep trees.
   */
  private _collectErrors(stopOnFirst: boolean): Error[] {
    const collected: Error[] = [];
    const seen = new Set<number>();

    const walk = (node: ComputedAtomImpl<unknown>): boolean => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);

      const error = node._error;
      if (error !== null) {
        collected.push(error);
        if (stopOnFirst) return true;
      }

      const deps = node._deps;
      if (deps.hasComputeds) {
        for (let i = 0, len = deps.slots.length; i < len; i++) {
          const link = deps.slots.at(i);
          if (link?.node.isComputed && walk(link.node as ComputedAtomImpl<unknown>)) {
            return true;
          }
        }
      }
      return false;
    };

    walk(this as unknown as ComputedAtomImpl<unknown>);
    return collected;
  }

  get lastError(): Error | null {
    const context = trackingContext.current;
    context?.addDependency(this);
    return this._error;
  }

  get isPending(): boolean {
    const context = trackingContext.current;
    context?.addDependency(this);
    return (this.flags & PENDING) !== 0;
  }

  get isResolved(): boolean {
    const context = trackingContext.current;
    context?.addDependency(this);
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

    this.flags = TRANSITIONS.TO_RECOMPUTING(this.flags);

    this._startTracking();

    try {
      const result = trackingContext.run(this, this._computation);
      this._commitDeps();

      this._handleResult(result);
    } finally {
      this._trackEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
      this._trackCount = 0;
      this.flags &= ~RECOMPUTING;
    }
  }

  private _handleResult(result: Result<T | Promise<T>, Error>): void {
    Result.match(result, {
      ok: (val) => {
        if (isPromise(val)) {
          this._handleAsyncComputation(val as Promise<T>);
        } else {
          this._finalizeResolution(val as T);
        }
      },
      err: (e) => {
        this._handleError(e, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, true);
      },
    });
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
    this.flags = TRANSITIONS.TO_PENDING(this.flags);
    this._notifySubscribers(undefined, undefined);

    const sessionId = ++this._sessionCounter;
    const session = { id: sessionId, promise };
    this._session = session;

    promise.then(
      (result) => {
        if (this._session?.id !== sessionId) return;

        // Constraint: If the node became dirty during the async wait,
        // defer resolution until the next read.
        if (this._isDirty()) return this._markDirty();

        this._finalizeResolution(result);
        this._notifySubscribers(result, undefined);
      },
      (error) =>
        this._session?.id === sessionId &&
        this._handleError(error, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED)
    );
  }

  private _handleError(error: unknown, message: string, shouldThrow = false): void {
    const wrappedError = wrapError(error, ComputedError, message);

    if (!this.isRejected || this._error !== wrappedError) {
      this.version = nextVersion(this.version);
    }

    this._error = wrappedError;
    this.flags = TRANSITIONS.TO_REJECTED(this.flags);

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
    this.flags = TRANSITIONS.TO_RESOLVED(this.flags);
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
    if ((flags & (RECOMPUTING | DIRTY)) !== 0) return;
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
