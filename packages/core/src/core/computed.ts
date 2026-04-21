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
 * Internal {@link ComputedAtom} implementation.
 *
 * Logic: Manages lazy evaluation, caching, and dependency tracking for derived values.
 * Evaluation is deferred until the `value` is accessed, at which point it captures
 * all reactive dependencies accessed during the computation.
 *
 * Optimization: Uses a cached `_hotIndex` and multi-phase dirty checking to
 * minimize traversal of the dependency graph during validation.
 */
class ComputedAtomImpl<T> extends ReactiveNode<T> implements ComputedAtom<T>, Subscriber {
  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Computed;

  // Bookkeeping fields grouped at top for V8 SMI/Number optimization
  /** Promise tracking ID */
  private _promiseId = 0;
  private _trackEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  private _trackCount = 0;

  private _value: T;
  private _error: Error | null = null;

  /** Initialized in constructor. Unified node property. */
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
    // Start dirty so first access triggers computation
    this.flags = IS_COMPUTED | DIRTY | IDLE;
    this._equal = options.equal ?? Object.is;
    this._computation = computation;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;

    debug.attachDebugInfo(this, 'computed', this.id, options.name);

    // Eager evaluation if not lazy
    if (options.lazy === false) {
      try {
        this._recompute();
      } catch {
        /* _handleError already stored error and called onError */
      }
    }
  }

  /** @internal */
  get isDirty(): boolean {
    return (this.flags & DIRTY) !== 0;
  }

  /** @internal */
  get isRejected(): boolean {
    return (this.flags & REJECTED) !== 0;
  }

  /** @internal */
  get isRecomputing(): boolean {
    return (this.flags & RECOMPUTING) !== 0;
  }

  /**
   * Logic: Three-Path Evaluation
   * 1. Fast Path: Returns the cached value immediately if stable and resolved.
   * 2. Exception Path: Handles disposal and circularity (triggering default value recovery).
   * 3. Evaluation Path: Validates dependencies and triggers re-computation if stale.
   */
  get value(): T {
    const context = trackingContext.current;
    if (context !== null) context.addDependency(this);

    const flags = this.flags;
    if ((flags & (RESOLVED | DIRTY | IDLE | DISPOSED | RECOMPUTING)) === RESOLVED) {
      return this._value;
    }

    if ((flags & DISPOSED) !== 0) throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);

    if ((flags & RECOMPUTING) !== 0) {
      const defaultValue = this._defaultValue;
      if (defaultValue !== (NO_DEFAULT_VALUE as T)) return defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if ((flags & (DIRTY | IDLE)) !== 0) {
      const dependencies = this._deps;
      const shouldRecompute =
        (flags & (IDLE | FORCE_COMPUTE)) !== 0 || dependencies.size === 0 || this._isDirty();

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

  peek(): T {
    return this._value;
  }

  get state(): AsyncStateType {
    const context = trackingContext.current;
    if (context !== null) context.addDependency(this);
    const flags = this.flags;
    if ((flags & RESOLVED) !== 0) return AsyncState.RESOLVED;
    if ((flags & PENDING) !== 0) return AsyncState.PENDING;
    if ((flags & REJECTED) !== 0) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  get hasError(): boolean {
    const context = trackingContext.current;
    if (context !== null) context.addDependency(this);

    const flags = this.flags;
    if ((flags & (REJECTED | HAS_ERROR)) !== 0) return true;

    const dependencies = this._deps;
    if (!dependencies.hasComputeds) return false;

    return untracked(() => {
      const size = dependencies.size;
      for (let i = 0; i < size; i++) {
        const link = dependencies.getAt(i);
        if (link?.node.hasError) return true;
      }
      return false;
    });
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    const context = trackingContext.current;
    if (context !== null) context.addDependency(this);

    const selfError = this._error;
    const dependencies = this._deps;

    if (!dependencies.hasComputeds) {
      if (selfError === null) return EMPTY_ERROR_ARRAY;
      return Object.freeze([selfError]);
    }

    const collected: Error[] = [];
    if (selfError !== null) collected.push(selfError);

    untracked(() => {
      const size = dependencies.size;
      for (let i = 0; i < size; i++) {
        const link = dependencies.getAt(i);
        const dependencyNode = link?.node;
        if (dependencyNode !== undefined && (dependencyNode.flags & IS_COMPUTED) !== 0) {
          this._accumulateErrors(dependencyNode as unknown as ComputedAtomImpl<unknown>, collected);
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

    const size = dependencies.size;
    for (let i = 0; i < size; i++) {
      const link = dependencies.getAt(i);
      const node = link?.node;
      if (node !== undefined && (node.flags & IS_COMPUTED) !== 0) {
        this._accumulateErrors(node as unknown as ComputedAtomImpl<unknown>, collected);
      }
    }
  }

  get lastError(): Error | null {
    const context = trackingContext.current;
    if (context !== null) context.addDependency(this);
    return this._error;
  }

  get isPending(): boolean {
    const context = trackingContext.current;
    if (context !== null) context.addDependency(this);
    return (this.flags & PENDING) !== 0;
  }

  get isResolved(): boolean {
    const context = trackingContext.current;
    if (context !== null) context.addDependency(this);
    return (this.flags & RESOLVED) !== 0;
  }

  invalidate(): void {
    this.flags |= FORCE_COMPUTE;
    this._markDirty();
  }

  dispose(): void {
    const flags = this.flags;
    if ((flags & DISPOSED) !== 0) return;

    this._deps.disposeAll();

    if (this._slots !== null) {
      this._slots.clear();
    }
    this.flags = DISPOSED | DIRTY | IDLE;

    this._error = null;
    this._value = undefined as T;
    this._hotIndex = -1;
  }

  addDependency(dependency: Dependency): void {
    const trackEpoch = this._trackEpoch;
    if (dependency._lastSeenEpoch === trackEpoch) return;
    dependency._lastSeenEpoch = trackEpoch;

    const trackIndex = this._trackCount++;
    const dependencies = this._deps;

    let existing: DependencyLink | null = null;
    if (trackIndex < 4) {
      if (trackIndex === 0) existing = dependencies._s0;
      else if (trackIndex === 1) existing = dependencies._s1;
      else if (trackIndex === 2) existing = dependencies._s2;
      else existing = dependencies._s3;
    } else {
      const overflow = dependencies._overflow;
      if (overflow !== null) existing = overflow[trackIndex - 4] ?? null;
    }

    if (existing !== null && existing.node === dependency) {
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

  private _recompute(): void {
    if ((this.flags & RECOMPUTING) !== 0) return;
    this.flags = (this.flags | RECOMPUTING) & ~FORCE_COMPUTE;

    this._trackEpoch = nextEpoch();
    this._trackCount = 0;
    this._deps.prepareTracking();
    this._hotIndex = -1;

    let committed = false;
    try {
      const result = trackingContext.run(this, this._computation);
      this._deps.truncateFrom(this._trackCount);
      committed = true;

      if (isPromise(result)) {
        this._handleAsyncComputation(result);
      } else {
        this._finalizeResolution(result);
      }
    } catch (e) {
      if (!committed) {
        try {
          this._deps.truncateFrom(this._trackCount);
        } catch (commitError) {
          if (IS_DEV) {
            console.warn('[atom-effect] _commitDeps failed during error recovery:', commitError);
          }
        }
      }
      this._handleError(e as Error, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, true);
    } finally {
      this._trackEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
      this._trackCount = 0;
      this.flags &= ~RECOMPUTING;
    }
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    this.flags = (this.flags | PENDING) & ~(IDLE | DIRTY | RESOLVED | REJECTED);
    this._notifySubscribers(undefined, undefined);

    this._promiseId = (this._promiseId + 1) % COMPUTED_CONFIG.MAX_PROMISE_ID;
    const promiseId = this._promiseId;

    promise.then(
      (result) => {
        if (promiseId !== this._promiseId) return;
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
    if ((flags & RESOLVED) === 0 || !this._equal(this._value, value)) {
      this.version = nextVersion(this.version);
    }

    this._value = value;
    this._error = null;
    this.flags = (flags | RESOLVED) & ~(IDLE | DIRTY | PENDING | REJECTED | HAS_ERROR);
  }

  execute(): void {
    this._markDirty();
  }

  /** @internal */
  _markDirty(): void {
    const flags = this.flags;
    if ((flags & (RECOMPUTING | DIRTY)) !== 0) return;
    this.flags = flags | DIRTY;
    debug.trackUpdate(this.id, debug.getDebugName(this));
    this._notifySubscribers(undefined, undefined);
  }

  /**
   * Deep dirty check for computations.
   *
   * Optimization: Selective Hot-Index Re-validation
   * Prioritizes the last known dirty dependency (hotIndex) to minimize average-case
   * traversal time, falling back to a full scan if necessary.
   */
  protected override _deepDirtyCheck(): boolean {
    const dependencies = this._deps;
    const size = dependencies.size;
    const hotIndex = this._hotIndex;

    return untracked(() => {
      if (hotIndex !== -1 && hotIndex < size) {
        const link = dependencies.getAt(hotIndex);
        if (link !== null && this._checkLinkDirty(link)) return true;
      }

      for (let i = 0; i < size; i++) {
        if (i === hotIndex) continue;
        const link = dependencies.getAt(i);
        if (link !== null && this._checkLinkDirty(link)) {
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
 * Creates a reactive computation derived from other atoms or computed values.
 *
 * When to use:
 * - When a value needs to be automatically derived from other reactive sources.
 * - To optimize performance by caching expensive calculations (only recomputed when stale).
 * - For projecting/filtering atom state into a read-only format.
 *
 * @param fn - The computation function.
 * @param options - Configuration for custom equality, lazy evaluation, or default values.
 * @returns A read-only reactive computed atom.
 *
 * @example
 * ```typescript
 * const count = atom(1);
 * const doubled = computed(() => count.value * 2);
 *
 * console.log(doubled.value); // 2
 * count.value = 5;
 * console.log(doubled.value); // 10
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
  return new ComputedAtomImpl(fn, options);
}
