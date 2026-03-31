import {
  AsyncState,
  COMPUTED_CONFIG,
  EMPTY_ERROR_ARRAY,
  EPOCH_CONSTANTS,
  IS_DEV,
  NODE_FLAGS,
  SMI_MAX,
} from '@/constants';
import { ReactiveNode } from '@/core/base';
import { DependencyLink } from '@/core/dep-tracking';
import { ComputedError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import { DepSlotBuffer } from '@/internal/dep-slot-buffer';
import { currentFlushEpoch, nextEpoch, nextVersion } from '@/internal/epoch';
import { ATOM_BRAND, COMPUTED_BRAND } from '@/symbols';
import { trackingContext } from '@/tracking';
import type {
  AsyncStateType,
  ComputedAtom,
  ComputedOptions,
  Dependency,
  Subscriber,
} from '@/types';
import { debug, NO_DEFAULT_VALUE } from '@/utils/debug';
import { wrapError } from '@/utils/error';
import { isPromise } from '@/utils/type-guards';

/**
 * Computed atom implementation.
 */
class ComputedAtomImpl<T> extends ReactiveNode<T> implements ComputedAtom<T>, Subscriber {
  /** @internal */
  readonly [ATOM_BRAND] = true;
  /** @internal */
  readonly [COMPUTED_BRAND] = true;

  private _value: T;
  private _error: Error | null = null;
  /** Promise tracking ID */
  private _promiseId = 0;

  private readonly _equal: (a: T, b: T) => boolean;
  private readonly _fn: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _onError: ((error: Error) => void) | null;
  private readonly _maxAsyncRetries: number;

  /** Initialized in constructor. Unified node property. */
  _deps = new DepSlotBuffer();

  // Async state

  private _asyncRetryCount = 0;
  private _lastDriftEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;

  // Dependency collection state
  private _trackEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  private _trackCount = 0;

  constructor(fn: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof fn !== 'function') throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    super();

    this._value = undefined as T;
    // Start dirty so first access triggers computation
    this.flags = NODE_FLAGS.IS_COMPUTED | NODE_FLAGS.COMPUTED_DIRTY | NODE_FLAGS.COMPUTED_IDLE;
    this._equal = options.equal ?? Object.is;
    this._fn = fn;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;
    this._maxAsyncRetries =
      (options.maxAsyncRetries ?? COMPUTED_CONFIG.MAX_ASYNC_RETRIES) & SMI_MAX;

    debug.attachDebugInfo(this, 'computed', this.id);

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
    return this.has(NODE_FLAGS.COMPUTED_DIRTY);
  }

  /** @internal */
  get isRejected(): boolean {
    return this.has(NODE_FLAGS.COMPUTED_REJECTED);
  }

  /** @internal */
  get isRecomputing(): boolean {
    return this.has(NODE_FLAGS.EXECUTING);
  }

  private _track(): void {
    trackingContext.current?.addDependency(this);
  }

  get value(): T {
    const ctx = trackingContext.current;
    if (ctx != null) ctx.addDependency(this);

    let flags = this.flags;
    // 1. Fast path: Stable and Resolved
    if (
      (flags &
        (NODE_FLAGS.COMPUTED_RESOLVED | NODE_FLAGS.COMPUTED_DIRTY | NODE_FLAGS.COMPUTED_IDLE)) ===
      NODE_FLAGS.COMPUTED_RESOLVED
    ) {
      return this._value;
    }

    // 2. Exception paths
    if (this.has(NODE_FLAGS.DISPOSED)) throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);

    if (this.has(NODE_FLAGS.EXECUTING)) {
      const def = this._defaultValue;
      if (def !== (NO_DEFAULT_VALUE as T)) return def;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    // 3. Evaluation path
    if (this.has(NODE_FLAGS.COMPUTED_DIRTY | NODE_FLAGS.COMPUTED_IDLE)) {
      const deps = this._deps;
      if (
        !this.has(NODE_FLAGS.COMPUTED_IDLE) &&
        !this.has(NODE_FLAGS.COMPUTED_FORCE_CHECK) &&
        deps.size > 0 &&
        !this._isDirty()
      ) {
        this.clear(NODE_FLAGS.COMPUTED_DIRTY);
        flags = this.flags;
      } else {
        this._recompute();
        flags = this.flags;
      }
      if ((flags & NODE_FLAGS.COMPUTED_RESOLVED) !== 0) return this._value;
    }

    // 4. Async/Error handling
    const def = this._defaultValue;
    const hasDefault = def !== (NO_DEFAULT_VALUE as T);

    if (this.has(NODE_FLAGS.COMPUTED_PENDING)) {
      if (hasDefault) return def;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
    }

    if (this.has(NODE_FLAGS.COMPUTED_REJECTED)) {
      if (hasDefault) return def;
      throw this._error;
    }

    return this._value;
  }

  peek(): T {
    return this._value;
  }

  get state(): AsyncStateType {
    const ctx = trackingContext.current;
    if (ctx != null) ctx.addDependency(this);
    if (this.has(NODE_FLAGS.COMPUTED_RESOLVED)) return AsyncState.RESOLVED;
    if (this.has(NODE_FLAGS.COMPUTED_PENDING)) return AsyncState.PENDING;
    if (this.has(NODE_FLAGS.COMPUTED_REJECTED)) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  get hasError(): boolean {
    const ctx = trackingContext.current;
    if (ctx != null) ctx.addDependency(this);

    const flags = this.flags;
    // Inlined checks for REJECTED | HAS_ERROR
    if ((flags & (NODE_FLAGS.COMPUTED_REJECTED | NODE_FLAGS.COMPUTED_HAS_ERROR)) !== 0) return true;

    const deps = this._deps;
    if (!deps.hasComputeds) return false;

    const size = deps.size;
    for (let i = 0; i < size; i++) {
      const link = deps.getAt(i);
      if (link?.node.hasError) return true;
    }
    return false;
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    const ctx = trackingContext.current;
    if (ctx != null) ctx.addDependency(this);

    const selfErr = this._error;
    const deps = this._deps;

    // Early exit: no computed dependencies means no bubbling errors
    if (!deps.hasComputeds) {
      if (selfErr == null) return EMPTY_ERROR_ARRAY;
      return Object.freeze([selfErr]);
    }

    const collected: Error[] = [];
    if (selfErr != null) collected.push(selfErr);

    const size = deps.size;
    for (let i = 0; i < size; i++) {
      const link = deps.getAt(i);
      if (link == null) continue;

      const dep = link.node;
      // Inlined isComputed + hasError check
      if (dep.isComputed && dep.hasError) {
        this._collectErrorsFromDep(dep as unknown as ComputedAtom<unknown>, collected);
      }
    }

    return collected.length === 0 ? EMPTY_ERROR_ARRAY : Object.freeze(collected);
  }

  private _collectErrorsFromDep(computedDep: ComputedAtom<unknown>, collected: Error[]): void {
    const errs = computedDep.errors;
    const len = errs.length;
    for (let j = 0; j < len; j++) {
      const err = errs[j];
      if (err != null && !collected.includes(err)) {
        collected.push(err);
      }
    }
  }

  get lastError(): Error | null {
    const ctx = trackingContext.current;
    if (ctx != null) ctx.addDependency(this);
    return this._error;
  }

  get isPending(): boolean {
    const ctx = trackingContext.current;
    if (ctx != null) ctx.addDependency(this);
    return this.has(NODE_FLAGS.COMPUTED_PENDING);
  }

  get isResolved(): boolean {
    const ctx = trackingContext.current;
    if (ctx != null) ctx.addDependency(this);
    return this.has(NODE_FLAGS.COMPUTED_RESOLVED);
  }

  invalidate(): void {
    this.set(NODE_FLAGS.COMPUTED_FORCE_CHECK);
    this._markDirty();
  }

  dispose(): void {
    if (this.has(NODE_FLAGS.DISPOSED)) return;

    this._deps.disposeAll();

    if (this._slots != null) {
      this._slots.clear();
    }
    this.flags = NODE_FLAGS.DISPOSED | NODE_FLAGS.COMPUTED_DIRTY | NODE_FLAGS.COMPUTED_IDLE;

    // Release Memory
    this._error = null;
    this._value = undefined as T;
    this._hotIndex = -1;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  addDependency(dep: Dependency): void {
    const trackEpoch = this._trackEpoch;
    if (dep._lastSeenEpoch === trackEpoch) return;
    dep._lastSeenEpoch = trackEpoch;

    const trackIndex = this._trackCount++;
    const deps = this._deps;
    const existing = deps.getAt(trackIndex);

    // 1. Stable Path: dependency index remains the same
    if (existing != null && existing.node === dep) {
      existing.version = dep.version;
    }
    // 2. Diverged Path: lookup or insert
    else if (deps.claimExisting(dep, trackIndex)) {
      // Version updated inside claimExisting
    }
    // 3. New dependency
    else {
      const link = new DependencyLink(dep, dep.version, dep.subscribe(this));
      deps.insertNew(trackIndex, link);
    }

    if (dep.isComputed) {
      deps.hasComputeds = true;
    }
  }

  private _recompute(): void {
    if (this.has(NODE_FLAGS.EXECUTING)) return;
    this.flags = (this.flags | NODE_FLAGS.EXECUTING) & ~NODE_FLAGS.COMPUTED_FORCE_CHECK;

    this._trackEpoch = nextEpoch();
    this._trackCount = 0;
    this._deps.prepareTracking();
    this._hotIndex = -1;

    let committed = false;
    try {
      // Execute function
      const result = trackingContext.run(this, this._fn);

      // Clean up any remaining trailing dependencies
      this._deps.truncateFrom(this._trackCount);
      this._deps.seal();
      committed = true;

      // Handle Result
      if (isPromise(result)) {
        this._handleAsyncComputation(result);
      } else {
        this._finalizeResolution(result);
      }
    } catch (e) {
      // Commit dependencies on error gracefully
      if (!committed) {
        try {
          this._deps.truncateFrom(this._trackCount);
        } catch (commitErr) {
          if (IS_DEV) {
            console.warn('[atom-effect] _commitDeps failed during error recovery:', commitErr);
          }
        }
      }
      this._handleError(e as Error, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, true);
    } finally {
      // Reset transient state
      this._trackEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
      this._trackCount = 0;
      this.clear(NODE_FLAGS.EXECUTING);
    }
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    // Set pending, clear idle/dirty/resolved/rejected
    const mask =
      NODE_FLAGS.COMPUTED_IDLE |
      NODE_FLAGS.COMPUTED_DIRTY |
      NODE_FLAGS.COMPUTED_RESOLVED |
      NODE_FLAGS.COMPUTED_REJECTED;
    this.flags = (this.flags & ~mask) | NODE_FLAGS.COMPUTED_PENDING;
    // Notify pending
    this._notifySubscribers(undefined, undefined);

    this._asyncRetryCount = 0;
    // Invalidate old promises
    this._promiseId = (this._promiseId + 1) % COMPUTED_CONFIG.MAX_PROMISE_ID;
    const promiseId = this._promiseId;

    promise.then(
      (res) => {
        if (promiseId !== this._promiseId) return; // Stale

        if (this._isDirty()) {
          // Reset retry counter when flush epoch changes — drifts across different
          // scheduler flushes are independent bursts, not a continuous failure streak.
          const epoch = currentFlushEpoch();
          if (this._lastDriftEpoch !== epoch) {
            this._lastDriftEpoch = epoch;
            this._asyncRetryCount = 0;
          }
          if (this._asyncRetryCount++ < this._maxAsyncRetries) {
            return this._markDirty(); // Retry
          }
          return this._handleError(
            new ComputedError(
              `Async drift threshold exceeded after ${this._maxAsyncRetries} retries.`
            ),
            ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED
          );
        }

        this._finalizeResolution(res);
        this._notifySubscribers(res, undefined);
      },
      (err) =>
        promiseId === this._promiseId &&
        this._handleError(err, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED)
    );
  }

  private _handleError(err: unknown, msg: string, throwErr = false): void {
    const error = wrapError(err, ComputedError, msg);

    if (!throwErr && !this.isRejected) {
      this.version = nextVersion(this.version);
    }

    this._error = error;
    // Set rejected + has_error, clear idle/dirty/pending/resolved
    const mask =
      NODE_FLAGS.COMPUTED_IDLE |
      NODE_FLAGS.COMPUTED_DIRTY |
      NODE_FLAGS.COMPUTED_PENDING |
      NODE_FLAGS.COMPUTED_RESOLVED;
    this.flags =
      (this.flags & ~mask) | NODE_FLAGS.COMPUTED_REJECTED | NODE_FLAGS.COMPUTED_HAS_ERROR;

    if (this._onError) {
      try {
        this._onError(error);
      } catch (e) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, e);
      }
    }

    if (throwErr) throw error;
    this._notifySubscribers(undefined, undefined);
  }

  private _finalizeResolution(value: T): void {
    // Only bump version if value actually changed or first resolve
    if (!this.has(NODE_FLAGS.COMPUTED_RESOLVED) || !this._equal(this._value, value)) {
      this.version = nextVersion(this.version);
    }

    this._value = value;
    this._error = null;
    // Set resolved, clear idle/dirty/pending/rejected/has_error
    const mask =
      NODE_FLAGS.COMPUTED_IDLE |
      NODE_FLAGS.COMPUTED_DIRTY |
      NODE_FLAGS.COMPUTED_PENDING |
      NODE_FLAGS.COMPUTED_REJECTED |
      NODE_FLAGS.COMPUTED_HAS_ERROR;
    this.flags = (this.flags & ~mask) | NODE_FLAGS.COMPUTED_RESOLVED;
  }

  execute(): void {
    // Subscriber implementation
    this._markDirty();
  }

  /** @internal */
  _markDirty(): void {
    if (this.has(NODE_FLAGS.EXECUTING | NODE_FLAGS.COMPUTED_DIRTY)) return;
    this.set(NODE_FLAGS.COMPUTED_DIRTY);
    this._notifySubscribers(undefined, undefined);
  }

  /**
   * Optimized dirty check. Bypasses deep scan if only Atoms are involved.
   */
  protected override _isDirty(): boolean {
    const deps = this._deps;
    if (deps.hasComputeds) return this._deepDirtyCheck();
    return deps.isDirtyFast();
  }

  /**
   * Deep dirty check for computations.
   */
  protected override _deepDirtyCheck(): boolean {
    const deps = this._deps;
    const prevContext = trackingContext.current;
    trackingContext.current = null;

    try {
      const size = deps.size;
      for (let i = 0; i < size; i++) {
        const link = deps.getAt(i);
        if (link == null) continue;

        const dep = link.node;
        // Inlined isComputed check
        if (dep.isComputed) {
          try {
            // Force computed to re-evaluate so version reflects latest state
            void (dep as { value: unknown }).value;
          } catch {
            if (IS_DEV)
              console.warn(`[atom-effect] Dependency #${dep.id} threw during dirty check`);
          }
        }

        if (dep.version !== link.version) {
          this._hotIndex = i;
          return true;
        }
      }

      this._hotIndex = -1;
      return false;
    } finally {
      trackingContext.current = prevContext;
    }
  }
}

/**
 * Creates a computed value.
 * @param fn - Computation function
 * @param options - Options object
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
