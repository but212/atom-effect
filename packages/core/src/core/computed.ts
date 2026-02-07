import { AsyncState, COMPUTED_STATE_FLAGS, EMPTY_ERROR_ARRAY, IS_DEV, SMI_MAX } from '@/constants';
import { ReactiveDependency } from '@/core/base';
import {
  DependencyLink,
  type SubscriberLink,
  syncDependencies,
  trackDependency,
} from '@/core/dep-tracking';
import { ComputedError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import { currentEpoch, nextEpoch, nextVersion } from '@/internal/epoch';
import { EMPTY_LINKS, linksArrayPool } from '@/internal/pool';
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

// Async state map
const ASYNC_STATE_MASK =
  COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.PENDING | COMPUTED_STATE_FLAGS.REJECTED;
const ASYNC_STATE_LOOKUP = Array(ASYNC_STATE_MASK + 1).fill(AsyncState.IDLE);
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.RESOLVED] = AsyncState.RESOLVED;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.PENDING] = AsyncState.PENDING;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.REJECTED] = AsyncState.REJECTED;

const MAX_ASYNC_RETRIES = 3;
const MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

// Pre-computed flag transition masks
const CLEAR_FOR_PENDING =
  COMPUTED_STATE_FLAGS.IDLE |
  COMPUTED_STATE_FLAGS.DIRTY |
  COMPUTED_STATE_FLAGS.RESOLVED |
  COMPUTED_STATE_FLAGS.REJECTED;
const CLEAR_FOR_REJECTED =
  COMPUTED_STATE_FLAGS.IDLE |
  COMPUTED_STATE_FLAGS.DIRTY |
  COMPUTED_STATE_FLAGS.PENDING |
  COMPUTED_STATE_FLAGS.RESOLVED;
const SET_REJECTED = COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR;
const CLEAR_FOR_RESOLVED =
  COMPUTED_STATE_FLAGS.IDLE |
  COMPUTED_STATE_FLAGS.DIRTY |
  COMPUTED_STATE_FLAGS.PENDING |
  COMPUTED_STATE_FLAGS.REJECTED |
  COMPUTED_STATE_FLAGS.HAS_ERROR;

/**
 * Computed atom implementation.
 */
class ComputedAtomImpl<T> extends ReactiveDependency<T> implements ComputedAtom<T>, Subscriber {
  private _value: T;
  private _error: Error | null = null;
  /** Promise tracking ID */
  private _promiseId = 0;

  private readonly _equal: (a: T, b: T) => boolean;
  private readonly _fn: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _onError: ((error: Error) => void) | null;
  private readonly _maxAsyncRetries: number;

  protected _subscribers: SubscriberLink<T>[] = [];
  private _links: DependencyLink[] = EMPTY_LINKS;

  /** Error cache */
  private _cachedErrors: readonly Error[] | null = null;
  private _errorCacheEpoch = -1;

  // Async state
  private _asyncStartAggregateVersion = 0;
  private _asyncRetryCount = 0;

  // Error dependency count for O(1) hasError
  private _errorDepCount = 0;

  // Dependency collection state
  private _trackEpoch = -1;
  private _trackLinks: DependencyLink[] = EMPTY_LINKS;
  private _trackCount = 0;

  constructor(fn: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof fn !== 'function') throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    super();

    this._value = undefined as T;
    // Start dirty so first access triggers computation
    this.flags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
    this._equal = options.equal ?? Object.is;
    this._fn = fn;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;
    const retries = options.maxAsyncRetries;
    this._maxAsyncRetries = retries != null && retries >= 0 ? retries : MAX_ASYNC_RETRIES;

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
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._subscribers);
  }

  get value(): T {
    this._track();

    const flags = this.flags;
    if (
      (flags &
        (COMPUTED_STATE_FLAGS.RESOLVED |
          COMPUTED_STATE_FLAGS.DIRTY |
          COMPUTED_STATE_FLAGS.IDLE)) ===
      COMPUTED_STATE_FLAGS.RESOLVED
    ) {
      return this._value;
    }

    if (flags & COMPUTED_STATE_FLAGS.DISPOSED) {
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);
    }

    if (flags & COMPUTED_STATE_FLAGS.RECOMPUTING) {
      if (this._defaultValue !== (NO_DEFAULT_VALUE as T)) return this._defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if (flags & (COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE)) {
      this._recompute();
      // Re-read flags after update
      if (this.flags & COMPUTED_STATE_FLAGS.RESOLVED) return this._value;
    }

    // 3. Async/Error handling
    const def = this._defaultValue;
    const hasDef = def !== (NO_DEFAULT_VALUE as T);

    if (this.flags & COMPUTED_STATE_FLAGS.PENDING) {
      if (hasDef) return def;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
    }

    if (this.flags & COMPUTED_STATE_FLAGS.REJECTED) {
      if ((this._error as ComputedError)?.recoverable && hasDef) return def;
      throw this._error;
    }

    return this._value;
  }

  peek(): T {
    return this._value;
  }

  get state(): AsyncStateType {
    this._track();
    return ASYNC_STATE_LOOKUP[this.flags & ASYNC_STATE_MASK];
  }

  get hasError(): boolean {
    this._track();
    if (this.flags & (COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR)) return true;

    // Fast path: cached count from last _recompute
    if (this._errorDepCount > 0) return true;

    // Live scan: deps may have changed error state asynchronously since last recompute
    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      const node = links[i]?.node;
      if (node && node.flags & COMPUTED_STATE_FLAGS.HAS_ERROR) return true;
    }
    return false;
  }

  // ... (isValid, errors, lastError getters remain structurally similar, omitted for brevity if mostly unchanged) ...
  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    this._track();
    if (!this.hasError) return EMPTY_ERROR_ARRAY;

    const epoch = currentEpoch();
    if (this._errorCacheEpoch === epoch && this._cachedErrors) return this._cachedErrors;

    // Collect errors directly into array, dedupe via indexOf (avoids Set allocation)
    const collected: Error[] = [];
    if (this._error) collected.push(this._error);

    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      const dep = links[i]!.node;
      if (dep.flags & COMPUTED_STATE_FLAGS.HAS_ERROR) {
        const computedDep = dep as unknown as ComputedAtom<unknown>;
        if (computedDep.errors) {
          const depErrors = computedDep.errors;
          for (let j = 0; j < depErrors.length; j++) {
            const err = depErrors[j];
            if (err && collected.indexOf(err) === -1) collected.push(err);
          }
        }
      }
    }

    const errors = Object.freeze(collected);
    this._errorCacheEpoch = epoch;
    this._cachedErrors = errors;
    return errors;
  }

  get lastError(): Error | null {
    this._track();
    return this._error;
  }

  get isPending(): boolean {
    this._track();
    return (this.flags & COMPUTED_STATE_FLAGS.PENDING) !== 0;
  }

  get isResolved(): boolean {
    this._track();
    return (this.flags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0;
  }

  invalidate(): void {
    this._markDirty();
    this._errorCacheEpoch = -1;
    this._cachedErrors = null;
  }

  dispose(): void {
    if (this.flags & COMPUTED_STATE_FLAGS.DISPOSED) return;

    const links = this._links;
    if (links !== EMPTY_LINKS) {
      for (let i = 0, len = links.length; i < len; i++) {
        links[i]!.unsub?.();
      }
      linksArrayPool.release(links);
      this._links = EMPTY_LINKS;
    }

    this._subscribers.length = 0;
    this.flags =
      COMPUTED_STATE_FLAGS.DISPOSED | COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;

    // Release Memory
    this._error = null;
    this._value = undefined as T;
    this._promiseId = (this._promiseId + 1) % MAX_PROMISE_ID;
    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
  }

  addDependency(dep: Dependency): void {
    // Deduplicate dependencies
    if (dep._lastSeenEpoch === this._trackEpoch) return;
    dep._lastSeenEpoch = this._trackEpoch;

    // Resize array if needed
    if (this._trackCount < this._trackLinks.length) {
      const link = this._trackLinks[this._trackCount]!;
      link.node = dep;
      link.version = dep.version;
    } else {
      this._trackLinks.push(new DependencyLink(dep, dep.version));
    }
    this._trackCount++;
  }

  private _commitDeps(prevLinks: DependencyLink[]): void {
    // Sync dependencies
    this._trackLinks.length = this._trackCount;
    syncDependencies(this._trackLinks, prevLinks, this);
    this._links = this._trackLinks;
  }

  private _updateErrorDepCount(): void {
    let count = 0;
    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      const node = links[i]?.node;
      if (node && node.flags & COMPUTED_STATE_FLAGS.HAS_ERROR) count++;
    }
    this._errorDepCount = count;
  }

  private _recompute(): void {
    if (this.flags & COMPUTED_STATE_FLAGS.RECOMPUTING) return;
    this.flags |= COMPUTED_STATE_FLAGS.RECOMPUTING;

    const prevLinks = this._links;
    this._trackEpoch = nextEpoch();
    this._trackLinks = linksArrayPool.acquire();
    this._trackCount = 0;

    let committed = false;
    try {
      // Execute function
      const result = trackingContext.run(this, this._fn);

      this._commitDeps(prevLinks);
      committed = true;
      this._updateErrorDepCount();

      // Handle Result
      if (isPromise(result)) {
        this._handleAsyncComputation(result);
      } else {
        this._finalizeResolution(result);
      }
    } catch (e) {
      // Commit dependencies on error
      if (!committed) {
        try {
          this._commitDeps(prevLinks);
          committed = true;
          this._updateErrorDepCount();
        } catch (commitErr) {
          if (IS_DEV) {
            console.warn('[atom-effect] _commitDeps failed during error recovery:', commitErr);
          }
        }
      }
      this._handleError(e as Error, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, true);
    } finally {
      // Release pool
      if (committed && prevLinks !== EMPTY_LINKS) {
        linksArrayPool.release(prevLinks);
      } else if (!committed) {
        linksArrayPool.release(this._trackLinks);
      }

      // Reset transient state
      this._trackEpoch = -1;
      this._trackLinks = EMPTY_LINKS;
      this._trackCount = 0;
      this.flags &= ~COMPUTED_STATE_FLAGS.RECOMPUTING;
    }
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    this.flags = (this.flags | COMPUTED_STATE_FLAGS.PENDING) & ~CLEAR_FOR_PENDING;
    // Notify pending
    this._notifySubscribers(undefined, undefined);

    this._asyncStartAggregateVersion = this._captureVersionSnapshot();
    this._asyncRetryCount = 0;
    // Invalidate old promises
    this._promiseId = (this._promiseId + 1) % MAX_PROMISE_ID;
    const promiseId = this._promiseId;

    promise.then(
      (res) => {
        if (promiseId !== this._promiseId) return; // Stale

        // Check for stale reads (did deps change while we waited?)
        if (this._captureVersionSnapshot() !== this._asyncStartAggregateVersion) {
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
    let aggregate = 0;
    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      // Hash mixing
      aggregate = ((((aggregate << 5) - aggregate) | 0) + links[i]!.node.version) & SMI_MAX;
    }
    return aggregate;
  }

  private _handleError(err: unknown, msg: string, throwErr = false): void {
    const error = wrapError(err, ComputedError, msg);

    if (!throwErr && !(this.flags & COMPUTED_STATE_FLAGS.REJECTED)) {
      // Update version
      this.version = nextVersion(this.version);
    }

    this._error = error;
    this.flags = (this.flags & ~CLEAR_FOR_REJECTED) | SET_REJECTED;

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
    if (!(this.flags & COMPUTED_STATE_FLAGS.RESOLVED) || !this._equal(this._value, value)) {
      this.version = nextVersion(this.version);
    }

    this._value = value;
    this._error = null;
    this.flags = (this.flags | COMPUTED_STATE_FLAGS.RESOLVED) & ~CLEAR_FOR_RESOLVED;

    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
  }

  execute(): void {
    // Subscriber implementation
    this._markDirty();
  }

  /** @internal */
  _markDirty(): void {
    if (this.flags & (COMPUTED_STATE_FLAGS.RECOMPUTING | COMPUTED_STATE_FLAGS.DIRTY)) return;
    this.flags |= COMPUTED_STATE_FLAGS.DIRTY;
    this._notifySubscribers(undefined, undefined);
  }
}

Object.freeze(ComputedAtomImpl.prototype);

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
