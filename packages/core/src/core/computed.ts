import { AsyncState, COMPUTED_STATE_FLAGS, EMPTY_ERROR_ARRAY, IS_DEV } from '@/constants';
import { ReactiveDependency } from '@/core/base';
import {
  DependencyLink,
  type SubscriberLink,
  syncDependencies,
  trackDependency,
} from '@/core/dep-tracking';
import { ComputedError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import { nextEpoch, nextVersion } from '@/internal/epoch';
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

const MAX_ASYNC_RETRIES = 3;
const MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

const { IDLE, DIRTY, PENDING, RESOLVED, REJECTED, HAS_ERROR, RECOMPUTING, DISPOSED, IS_COMPUTED } =
  COMPUTED_STATE_FLAGS;

function getAsyncState(flags: number): AsyncStateType {
  if (flags & RESOLVED) return AsyncState.RESOLVED;
  if (flags & PENDING) return AsyncState.PENDING;
  if (flags & REJECTED) return AsyncState.REJECTED;
  return AsyncState.IDLE;
}

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

  // Async state
  private _asyncStartAggregateVersion = 0;
  private _asyncRetryCount = 0;

  // Dependency collection state
  private _trackEpoch = -1;
  private _trackLinks: DependencyLink[] = EMPTY_LINKS;
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
      this._recompute();
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
    return getAsyncState(this.flags);
  }

  get hasError(): boolean {
    this._track();
    if (this.flags & (REJECTED | HAS_ERROR)) return true;

    // Live scan: deps may have changed error state asynchronously
    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      const node = links[i]?.node;
      if (node && node.flags & HAS_ERROR) return true;
    }
    return false;
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    this._track();
    if (!this.hasError) return EMPTY_ERROR_ARRAY;

    // Collect errors directly into array, dedupe via indexOf (avoids Set allocation)
    const collected: Error[] = [];
    if (this._error) collected.push(this._error);

    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      const dep = links[i]!.node;
      if (dep.flags & HAS_ERROR) {
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

    return Object.freeze(collected);
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
    this._markDirty();
  }

  dispose(): void {
    if (this.flags & DISPOSED) return;

    const links = this._links;
    if (links !== EMPTY_LINKS) {
      for (let i = 0, len = links.length; i < len; i++) {
        links[i]!.unsub?.();
      }
      linksArrayPool.release(links);
      this._links = EMPTY_LINKS;
    }

    this._subscribers.length = 0;
    this.flags = DISPOSED | DIRTY | IDLE;

    // Release Memory
    this._error = null;
    this._value = undefined as T;
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

  private _recompute(): void {
    if (this.flags & RECOMPUTING) return;
    this.flags |= RECOMPUTING;

    const prevLinks = this._links;
    this._trackEpoch = nextEpoch();
    this._trackLinks = linksArrayPool.acquire();
    this._trackCount = 0;

    let committed = false;
    try {
      // Execute function
      const result = trackingContext.run(this, this._fn);

      // Inline _commitDeps
      this._trackLinks.length = this._trackCount;
      syncDependencies(this._trackLinks, prevLinks, this);
      this._links = this._trackLinks;
      committed = true;

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
          this._trackLinks.length = this._trackCount;
          syncDependencies(this._trackLinks, prevLinks, this);
          this._links = this._trackLinks;
          committed = true;
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
    let sum = 0;
    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      sum += links[i]!.node.version;
    }
    return sum;
  }

  private _handleError(err: unknown, msg: string, throwErr = false): void {
    const error = wrapError(err, ComputedError, msg);

    if (!throwErr && !(this.flags & REJECTED)) {
      // Update version
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
