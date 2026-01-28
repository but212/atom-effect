import { AsyncState, COMPUTED_STATE_FLAGS, EMPTY_ERROR_ARRAY, SMI_MAX } from '@/constants';
import { ReactiveDependency } from '@/core/base';
import {
  DependencyLink,
  type SubscriberLink,
  syncDependencies,
  trackDependency,
} from '@/core/dep-tracking';
import type { AtomError } from '@/errors/errors';
import { ComputedError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import { currentEpoch, nextEpoch } from '@/internal/epoch';
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

// AsyncState mapping
const ASYNC_STATE_MASK =
  COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.PENDING | COMPUTED_STATE_FLAGS.REJECTED;
const ASYNC_STATE_LOOKUP = Array(ASYNC_STATE_MASK + 1).fill(AsyncState.IDLE);
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.RESOLVED] = AsyncState.RESOLVED;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.PENDING] = AsyncState.PENDING;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.REJECTED] = AsyncState.REJECTED;

const MAX_ASYNC_RETRIES = 3;
const MAX_PROMISE_ID = Number.MAX_SAFE_INTEGER - 1;

/**
 * Computed atom with lazy evaluation, caching, and async support.
 * Uses bit flags for state and epoch-based dependency deduplication.
 */
class ComputedAtomImpl<T> extends ReactiveDependency<T> implements ComputedAtom<T>, Subscriber {
  private _value: T;
  private _error: AtomError | null = null;
  private _promiseId = 0;
  private readonly _equal: (a: T, b: T) => boolean;
  private readonly _fn: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _onError: ((error: Error) => void) | null;

  protected _subscribers: SubscriberLink<T>[] = [];
  private _links: DependencyLink[] = EMPTY_LINKS;

  private _cachedErrors: readonly Error[] | null = null;
  private _errorCacheEpoch = -1;

  private _asyncStartAggregateVersion = 0;
  private _asyncRetryCount = 0;

  private _trackEpoch = -1;
  private _trackLinks: DependencyLink[] = EMPTY_LINKS;
  private _trackCount = 0;

  constructor(fn: () => T | Promise<T>, options: ComputedOptions<T> = {}) {
    if (typeof fn !== 'function') throw new ComputedError(ERROR_MESSAGES.COMPUTED_MUST_BE_FUNCTION);
    super();

    this._value = undefined as T;
    this.flags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
    this._equal = options.equal ?? Object.is;
    this._fn = fn;
    this._defaultValue = 'defaultValue' in options ? options.defaultValue : (NO_DEFAULT_VALUE as T);
    this._onError = options.onError ?? null;

    debug.attachDebugInfo(this, 'computed', this.id);

    if (debug.enabled) {
      const debugObj = this as unknown as Record<string, unknown>;
      debugObj.subscriberCount = this.subscriberCount.bind(this);
      debugObj.isDirty = () => (this.flags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;
      debugObj.links = this._links;
    }

    if (options.lazy === false)
      try {
        this._recompute();
      } catch {}
  }

  private _track(): void {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._subscribers);
  }

  /**
   * Retrieves the computed value.
   * If the value is dirty or computed for the first time, it re-evaluates.
   * Tracks dependencies if called within a reactive context.
   */
  get value(): T {
    this._track();

    let flags = this.flags;
    if (
      (flags &
        (COMPUTED_STATE_FLAGS.RESOLVED |
          COMPUTED_STATE_FLAGS.DIRTY |
          COMPUTED_STATE_FLAGS.IDLE)) ===
      COMPUTED_STATE_FLAGS.RESOLVED
    ) {
      return this._value;
    }

    if (flags & COMPUTED_STATE_FLAGS.DISPOSED)
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);

    if (flags & COMPUTED_STATE_FLAGS.RECOMPUTING) {
      if (this._defaultValue !== (NO_DEFAULT_VALUE as T)) return this._defaultValue;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if (flags & (COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE)) {
      this._recompute();
      flags = this.flags;
    }

    if (flags & COMPUTED_STATE_FLAGS.RESOLVED) return this._value;

    const def = this._defaultValue;
    const hasDef = def !== (NO_DEFAULT_VALUE as T);

    if (flags & COMPUTED_STATE_FLAGS.PENDING) {
      if (hasDef) return def;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
    }

    if (flags & COMPUTED_STATE_FLAGS.REJECTED) {
      if (this._error?.recoverable && hasDef) return def;
      throw this._error;
    }

    return this._value;
  }

  /**
   * Returns the current value without triggering re-evaluation or dependency tracking.
   * Note: This may return a stale value if the computed is dirty.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Gets the current async state of the computed value (IDLE, PENDING, RESOLVED, REJECTED).
   */
  get state(): AsyncStateType {
    this._track();
    return ASYNC_STATE_LOOKUP[this.flags & ASYNC_STATE_MASK];
  }

  get hasError(): boolean {
    this._track();
    if (this.flags & (COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR)) return true;
    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      if (links[i]!.node.flags & COMPUTED_STATE_FLAGS.HAS_ERROR) return true;
    }
    return false;
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    this._track();
    if (!this.hasError) return EMPTY_ERROR_ARRAY;

    const epoch = currentEpoch();
    if (this._errorCacheEpoch === epoch && this._cachedErrors) return this._cachedErrors;

    const errorSet = new Set<Error>();
    if (this._error) errorSet.add(this._error);

    const links = this._links;
    for (let i = 0, len = links.length; i < len; i++) {
      const dep = links[i]!.node;
      if (dep.flags & COMPUTED_STATE_FLAGS.HAS_ERROR) {
        const depErrors = (dep as unknown as ComputedAtom<unknown>).errors;
        if (depErrors) {
          for (let j = 0, len2 = depErrors.length; j < len2; j++) {
            const err = depErrors[j];
            if (err) errorSet.add(err);
          }
        }
      }
    }

    const errors = Object.freeze(Array.from(errorSet));
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

  /**
   * Manually invalidates the computed value, forcing it to be re-evaluated on next access.
   */
  invalidate(): void {
    this._markDirty();
    this._errorCacheEpoch = -1;
    this._cachedErrors = null;
  }

  /**
   * Disposes the computed atom, stopping dependency tracking and clearing state.
   */
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
    this._error = null;
    this._value = undefined as T;
    this._promiseId = (this._promiseId + 1) % MAX_PROMISE_ID;
    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
  }

  addDependency(dep: Dependency): void {
    if (dep._lastSeenEpoch === this._trackEpoch) return;
    dep._lastSeenEpoch = this._trackEpoch;

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
    this._trackLinks.length = this._trackCount;
    syncDependencies(this._trackLinks, prevLinks, this);
    this._links = this._trackLinks;
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
      const result = trackingContext.run(this, this._fn);
      this._commitDeps(prevLinks);
      committed = true;

      isPromise(result) ? this._handleAsyncComputation(result) : this._finalizeResolution(result);
    } catch (e) {
      if (!committed) {
        try {
          this._commitDeps(prevLinks);
          committed = true;
        } catch {}
      }
      this._handleError(e as Error, ERROR_MESSAGES.COMPUTED_COMPUTATION_FAILED, true);
    } finally {
      if (committed && prevLinks !== EMPTY_LINKS) linksArrayPool.release(prevLinks);
      else if (!committed) linksArrayPool.release(this._trackLinks);

      this._trackEpoch = -1;
      this._trackLinks = EMPTY_LINKS;
      this._trackCount = 0;
      this.flags &= ~COMPUTED_STATE_FLAGS.RECOMPUTING;
    }
  }

  private _handleAsyncComputation(promise: Promise<T>): void {
    this.flags =
      (this.flags | COMPUTED_STATE_FLAGS.PENDING) &
      ~(
        COMPUTED_STATE_FLAGS.IDLE |
        COMPUTED_STATE_FLAGS.DIRTY |
        COMPUTED_STATE_FLAGS.RESOLVED |
        COMPUTED_STATE_FLAGS.REJECTED
      );
    this._notifySubscribers(undefined, undefined);

    this._asyncStartAggregateVersion = this._captureVersionSnapshot();
    this._asyncRetryCount = 0;
    this._promiseId = (this._promiseId + 1) % MAX_PROMISE_ID;
    const promiseId = this._promiseId;

    promise.then(
      (res) => {
        if (promiseId !== this._promiseId) return;
        if (this._captureVersionSnapshot() !== this._asyncStartAggregateVersion) {
          if (this._asyncRetryCount++ < MAX_ASYNC_RETRIES) return this._markDirty();
          return this._handleError(
            new ComputedError(`Async drift threshold exceeded after ${MAX_ASYNC_RETRIES} retries.`),
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
      aggregate = ((((aggregate << 5) - aggregate) | 0) + links[i]!.node.version) & SMI_MAX;
    }
    return aggregate;
  }

  private _handleError(err: unknown, msg: string, throwErr = false): void {
    const error = wrapError(err, ComputedError, msg);

    if (!throwErr && !(this.flags & COMPUTED_STATE_FLAGS.REJECTED)) {
      this.version = (this.version + 1) & SMI_MAX;
    }

    this._error = error;
    this.flags =
      (this.flags &
        ~(
          COMPUTED_STATE_FLAGS.IDLE |
          COMPUTED_STATE_FLAGS.DIRTY |
          COMPUTED_STATE_FLAGS.PENDING |
          COMPUTED_STATE_FLAGS.RESOLVED
        )) |
      (COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR);

    if (this._onError)
      try {
        this._onError(error);
      } catch (e) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, e);
      }

    if (throwErr) throw error;
    this._notifySubscribers(undefined, undefined);
  }

  private _finalizeResolution(value: T): void {
    if (!(this.flags & COMPUTED_STATE_FLAGS.RESOLVED) || !this._equal(this._value, value)) {
      this.version = (this.version + 1) & SMI_MAX;
    }

    this._value = value;
    this._error = null;
    this.flags =
      (this.flags | COMPUTED_STATE_FLAGS.RESOLVED) &
      ~(
        COMPUTED_STATE_FLAGS.IDLE |
        COMPUTED_STATE_FLAGS.DIRTY |
        COMPUTED_STATE_FLAGS.PENDING |
        COMPUTED_STATE_FLAGS.REJECTED |
        COMPUTED_STATE_FLAGS.HAS_ERROR
      );

    this._cachedErrors = null;
    this._errorCacheEpoch = -1;
  }

  execute(): void {
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
 * Creates a computed value with automatic dependency tracking.
 * Supports sync/async computations with caching and lazy evaluation.
 * @param fn - Computation function (sync or async)
 * @param options - { equal?, defaultValue?, onError?, lazy? }
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
