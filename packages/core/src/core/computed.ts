import {
  AsyncState,
  COMPUTED_CONFIG,
  COMPUTED_STATE_FLAGS,
  EMPTY_ERROR_ARRAY,
  EPOCH_CONSTANTS,
  IS_DEV,
  SMI_MAX,
} from '@/constants';
import { ReactiveDependency } from '@/core/base';
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
 * Computed atom implementation.
 */
class ComputedAtomImpl<T> extends ReactiveDependency<T> implements ComputedAtom<T>, Subscriber {
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

  private _deps = new DepSlotBuffer();

  // Async state
  private _asyncStartAggregateVersion = 0;
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
    this.flags = IS_COMPUTED | DIRTY | IDLE;
    this._equal = options.equal ?? Object.is;
    this._fn = fn;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;
    const retries = options.maxAsyncRetries;
    this._maxAsyncRetries = (retries ?? COMPUTED_CONFIG.MAX_ASYNC_RETRIES) & SMI_MAX;

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

  private _track(): void {
    trackingContext.current?.addDependency(this);
  }

  get value(): T {
    this._track();

    const flags = this.flags;
    if ((flags & (RESOLVED | DIRTY | IDLE)) === RESOLVED) {
      return this._value;
    }

    if (flags & DISPOSED) {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);
    }

    if (flags & RECOMPUTING) {
      if (this._defaultValue !== (NO_DEFAULT_VALUE as T)) return this._defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if (flags & (DIRTY | IDLE)) {
      if (
        (flags & IDLE) === 0 &&
        (flags & FORCE_COMPUTE) === 0 &&
        this._deps.size > 0 &&
        !this._isDirty()
      ) {
        // Deps-stable skip: dependencies haven't changed, output remains the same
        this.flags &= ~DIRTY;
      } else {
        this._recompute();
      }
      // Re-read flags after update
      if (this.flags & RESOLVED) return this._value;
    }

    // 3. Async/Error handling
    const def = this._defaultValue;
    const hasDef = def !== (NO_DEFAULT_VALUE as T);

    if (this.flags & PENDING) {
      if (hasDef) return def;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
    }

    if (this.flags & REJECTED) {
      if (hasDef) return def;
      throw this._error;
    }

    return this._value;
  }

  peek(): T {
    return this._value;
  }

  get state(): AsyncStateType {
    this._track();
    const flags = this.flags;
    if (flags & RESOLVED) return AsyncState.RESOLVED;
    if (flags & PENDING) return AsyncState.PENDING;
    if (flags & REJECTED) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  get hasError(): boolean {
    this._track();
    const flags = this.flags;
    if (flags & (REJECTED | HAS_ERROR)) return true;

    const deps = this._deps;
    const size = deps.size;
    for (let i = 0; i < size; i++) {
      const link = deps.getAt(i);
      if (link != null && link.node.flags & HAS_ERROR) return true;
    }
    return false;
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    this._track();

    // 1. Collect errors
    const collected: Error[] = [];
    if (this._error) collected.push(this._error);

    const deps = this._deps;
    const size = deps.size;
    for (let i = 0; i < size; i++) {
      const link = deps.getAt(i);
      if (link == null) continue;

      const dep = link.node;
      if (dep.flags & HAS_ERROR) {
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
    this._track();
    return this._error;
  }

  get isPending(): boolean {
    this._track();
    return (this.flags & PENDING) !== 0;
  }

  get isResolved(): boolean {
    this._track();
    return (this.flags & RESOLVED) !== 0;
  }

  invalidate(): void {
    this.flags |= FORCE_COMPUTE;
    this._markDirty();
  }

  dispose(): void {
    if (this.flags & DISPOSED) return;

    this._deps.disposeAll();

    this._slots?.clear();
    this.flags = DISPOSED | DIRTY | IDLE;

    // Release Memory
    this._error = null;
    this._value = undefined as T;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  addDependency(dep: Dependency): void {
    if (dep._lastSeenEpoch === this._trackEpoch) return;
    dep._lastSeenEpoch = this._trackEpoch;

    const trackIndex = this._trackCount;
    const existing = this._deps.getAt(trackIndex);

    // 1. Stable Path: dependency index remains the same
    if (existing != null && existing.node === dep) {
      existing.version = dep.version;
    }
    // 2. Diverged Path: lookup or insert
    else if (this._deps.claimExisting(dep, trackIndex)) {
      // Version updated inside claimExisting
    }
    // 3. New dependency
    else {
      const link = new DependencyLink(dep, dep.version, dep.subscribe(this));
      this._deps.insertNew(trackIndex, link);
    }

    if (dep.flags & IS_COMPUTED) {
      this._deps.hasComputeds = true;
    }
    this._trackCount = trackIndex + 1;
  }

  private _recompute(): void {
    if (this.flags & RECOMPUTING) return;
    this.flags = (this.flags | RECOMPUTING) & ~FORCE_COMPUTE;

    this._trackEpoch = nextEpoch();
    this._trackCount = 0;
    this._deps.prepareTracking();

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
      this.flags &= ~RECOMPUTING;
    }
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    // Set pending, clear idle/dirty/resolved/rejected
    this.flags = (this.flags | PENDING) & ~(IDLE | DIRTY | RESOLVED | REJECTED);
    // Notify pending
    this._notifySubscribers(undefined, undefined);

    this._asyncStartAggregateVersion = this._captureVersionSnapshot();
    this._asyncRetryCount = 0;
    // Invalidate old promises
    this._promiseId = (this._promiseId + 1) % COMPUTED_CONFIG.MAX_PROMISE_ID;
    const promiseId = this._promiseId;

    promise.then(
      (res) => {
        if (promiseId !== this._promiseId) return; // Stale

        if (this._captureVersionSnapshot() !== this._asyncStartAggregateVersion) {
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

  private _captureVersionSnapshot(): number {
    return this._deps.captureVersionSnapshot();
  }

  private _handleError(err: unknown, msg: string, throwErr = false): void {
    const error = wrapError(err, ComputedError, msg);

    if (!throwErr && !(this.flags & REJECTED)) {
      this.version = nextVersion(this.version);
    }

    this._error = error;
    // Set rejected + has_error, clear idle/dirty/pending/resolved
    this.flags = (this.flags & ~(IDLE | DIRTY | PENDING | RESOLVED)) | REJECTED | HAS_ERROR;

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
    if (!(this.flags & RESOLVED) || !this._equal(this._value, value)) {
      this.version = nextVersion(this.version);
    }

    this._value = value;
    this._error = null;
    // Set resolved, clear idle/dirty/pending/rejected/has_error
    this.flags = (this.flags | RESOLVED) & ~(IDLE | DIRTY | PENDING | REJECTED | HAS_ERROR);
  }

  execute(): void {
    // Subscriber implementation
    this._markDirty();
  }

  /** @internal */
  _markDirty(): void {
    if (this.flags & (RECOMPUTING | DIRTY)) return;
    this.flags |= DIRTY;
    this._notifySubscribers(undefined, undefined);
  }

  /**
   * Two-phase dirty check:
   * 1. Fast path (O(N)): Check if any direct dependency's version hash has changed.
   * 2. Full path: Recursively pull and verify each computed dependency.
   */
  private _isDirty(): boolean {
    const deps = this._deps;
    if (!deps.hasComputeds && !deps.isDirtyFast()) return false;

    const prevContext = trackingContext.current;
    trackingContext.current = null;

    try {
      const size = deps.size;
      for (let i = 0; i < size; i++) {
        const link = deps.getAt(i);
        if (link == null) continue;

        const dep = link.node;
        if (dep.flags & IS_COMPUTED) {
          this._tryPullComputed(dep);
        }

        if (dep.version !== link.version) return true;
      }
      return false;
    } finally {
      trackingContext.current = prevContext;
    }
  }

  private _tryPullComputed(dep: Dependency): void {
    try {
      // Force computed to re-evaluate so version reflects latest state
      void (dep as { value: unknown }).value;
    } catch {
      if (IS_DEV) {
        console.warn(`[atom-effect] Dependency #${dep.id} threw during dirty check`);
      }
      // Swallow error: rely strictly on version check to prevent permanent fast-path bypass
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
