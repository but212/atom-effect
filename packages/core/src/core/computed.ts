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
import { ATOM_BRAND, COMPUTED_BRAND } from '@/symbols';
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
import { DependencyLink, trackingContext } from './tracking';

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
class ComputedAtomImpl<T> extends ReactiveNode<T> implements ComputedAtom<T>, Subscriber {
  /** @internal */
  readonly [ATOM_BRAND] = true;
  /** @internal */
  readonly [COMPUTED_BRAND] = true;

  private _value: T;
  private _error: Error | null = null;
  private _promiseId = 0;

  private _equal: ((a: T, b: T) => boolean) | null;
  private _fn: (() => T | Promise<T>) | null;
  private _defaultValue: T;
  private _onError: ((error: Error) => void) | null;

  /** Initialized in constructor. Unified node property. */
  _deps = new DepSlotBuffer();

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
    return (this.flags & DIRTY) !== 0;
  }

  /** @internal */
  // --- 1. Basic Getters (Value & Identity) ---

  get value(): T {
    this._track();
    this._refresh();

    const flags = this.flags;
    if ((flags & DISPOSED) !== 0) throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);

    if ((flags & RECOMPUTING) !== 0) {
      const def = this._defaultValue;
      if (def !== (NO_DEFAULT_VALUE as T)) return def;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    if ((flags & RESOLVED) !== 0) return this._value;

    const def = this._defaultValue;
    const hasDefault = def !== (NO_DEFAULT_VALUE as T);

    if ((flags & PENDING) !== 0) {
      if (hasDefault) return def;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
    }

    if ((flags & REJECTED) !== 0) {
      if (hasDefault) return def;
      throw this._error;
    }

    return this._value;
  }

  get state(): AsyncStateType {
    this._track();
    const flags = this.flags;
    if ((flags & RESOLVED) !== 0) return AsyncState.RESOLVED;
    if ((flags & PENDING) !== 0) return AsyncState.PENDING;
    if ((flags & REJECTED) !== 0) return AsyncState.REJECTED;
    return AsyncState.IDLE;
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

  get hasError(): boolean {
    this._track();
    const flags = this.flags;
    if ((flags & (REJECTED | HAS_ERROR)) !== 0) return true;
    if (!this._deps.hasComputeds) return false;

    let found = false;
    this._walkErrorGraph((dep) => {
      if ((dep.flags & (REJECTED | HAS_ERROR)) !== 0) {
        found = true;
        return false;
      }
      return true;
    });
    return found;
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    this._track();
    const collected: Error[] = [];
    if (this._error != null) collected.push(this._error);

    if (this._deps.hasComputeds) {
      this._walkErrorGraph((dep) => {
        if ((dep.flags & IS_COMPUTED) !== 0) {
          const err = (dep as ComputedAtomImpl<unknown>)._error;
          if (err != null && !collected.includes(err)) collected.push(err);
        }
        return true;
      });
    }

    return collected.length === 0 ? EMPTY_ERROR_ARRAY : Object.freeze(collected);
  }

  // --- 2. Public APIs ---

  peek(): T {
    return this._value;
  }

  invalidate(): void {
    this.flags |= FORCE_COMPUTE;
    this._markDirty();
  }

  dispose(): void {
    if ((this.flags & DISPOSED) !== 0) return;

    this._deps.disposeAll();
    if (this._slots != null) this._slots.clear();

    this.flags = DISPOSED | DIRTY | IDLE;
    this._error = null;
    this._value = undefined as T;
    this._hotIndex = -1;

    // Explicitly release large references
    this._fn = null;
    this._onError = null;
    this._equal = null;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  // --- 3. Internal Engine (Computation & Evaluation) ---

  execute(): void {
    this._markDirty();
  }

  private _refresh(): void {
    let flags = this.flags;
    if ((flags & (DISPOSED | RECOMPUTING)) !== 0) return;

    if ((flags & (DIRTY | IDLE | REJECTED)) === 0 && (flags & RESOLVED) !== 0) {
      if (!this._isDirty()) return;
      flags = this.flags;
    }

    const isDirtyResult = this._isDirty();
    if ((flags & (IDLE | REJECTED)) === 0 && (flags & FORCE_COMPUTE) === 0 && !isDirtyResult) {
      this.flags &= ~DIRTY;
      return;
    }

    if ((flags & (REJECTED | RESOLVED)) !== 0 && !isDirtyResult && (flags & FORCE_COMPUTE) === 0) {
      return;
    }

    try {
      this._recompute();
    } catch {
      /* Re-computation error is captured in internal state */
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
      const fn = this._fn;
      if (fn == null) throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);

      const result = trackingContext.run(this, fn);
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
        } catch (err) {
          if (IS_DEV) console.warn('[atom-effect] _commitDeps failed during error recovery:', err);
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
    this.flags = (this.flags | PENDING) & ~(IDLE | DIRTY | RESOLVED | REJECTED | HAS_ERROR);
    this._notifySubscribers(undefined, undefined);

    this._promiseId = (this._promiseId + 1) % COMPUTED_CONFIG.MAX_PROMISE_ID;
    const promiseId = this._promiseId;

    promise.then(
      (res) => {
        if (promiseId !== this._promiseId || (this.flags & DISPOSED) !== 0) return;
        if (this._isDirty()) return this._markDirty();

        this._finalizeResolution(res);
        this._notifySubscribers(res, undefined);
      },
      (err) => {
        if (promiseId === this._promiseId && (this.flags & DISPOSED) === 0) {
          this._handleError(err, ERROR_MESSAGES.COMPUTED_ASYNC_COMPUTATION_FAILED);
        }
      }
    );
  }

  // --- 5. Result Handlers ---

  private _finalizeResolution(value: T): void {
    const flags = this.flags;
    const equal = this._equal;
    if ((flags & RESOLVED) === 0 || (equal != null && !equal(this._value, value))) {
      this.version = nextVersion(this.version);
    }

    this._value = value;
    this._error = null;
    this.flags = (flags | RESOLVED) & ~(IDLE | DIRTY | PENDING | REJECTED | HAS_ERROR);
  }

  private _handleError(err: unknown, msg: string, throwErr = false): void {
    const error = wrapError(err, ComputedError, msg);
    this.version = nextVersion(this.version);
    this._error = error;
    this.flags = (this.flags & ~(IDLE | DIRTY | PENDING | RESOLVED)) | REJECTED | HAS_ERROR;

    const onError = this._onError;
    if (onError != null) {
      try {
        onError(error);
      } catch (e) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, e);
      }
    }

    if (throwErr) throw error;
    this._notifySubscribers(undefined, undefined);
  }

  // --- 6. Graph & Dependency Management ---

  addDependency(dep: Dependency): void {
    const trackEpoch = this._trackEpoch;
    if (dep._lastSeenEpoch === trackEpoch) return;
    dep._lastSeenEpoch = trackEpoch;

    const trackIndex = this._trackCount++;
    const deps = this._deps;
    const existing = deps.getAt(trackIndex);

    if (existing != null && existing.node === dep) {
      existing.version = dep.version;
    } else if (deps.claimExisting(dep, trackIndex)) {
      // Version handled internally
    } else {
      deps.insertNew(trackIndex, new DependencyLink(dep, dep.version, dep.subscribe(this)));
    }

    if ((dep.flags & IS_COMPUTED) !== 0) deps.hasComputeds = true;
  }

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
        if ((dep.flags & IS_COMPUTED) !== 0) {
          try {
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

  private _walkErrorGraph(visitor: (dep: Dependency) => boolean): void {
    const deps = this._deps;
    const queue: Dependency[] = [];
    const visited = new Set<Dependency>();

    const size = deps.size;
    for (let i = 0; i < size; i++) {
      const link = deps.getAt(i);
      if (link != null) {
        queue.push(link.node);
        visited.add(link.node);
      }
    }

    let head = 0;
    while (head < queue.length) {
      const dep = queue[head++];
      if (dep == null) continue;
      if (!visitor(dep)) return;

      const internalDep = dep as unknown as { _deps?: DepSlotBuffer; flags: number };
      if ((internalDep.flags & IS_COMPUTED) !== 0 || internalDep._deps != null) {
        const cDeps = internalDep._deps;
        if (cDeps != null) {
          const s = cDeps.size;
          for (let i = 0; i < s; i++) {
            const link = cDeps.getAt(i);
            if (link != null && !visited.has(link.node)) {
              queue.push(link.node);
              visited.add(link.node);
            }
          }
        }
      }
    }
  }

  private _track(): void {
    trackingContext.current?.addDependency(this);
  }

  /** @internal */
  _markDirty(): void {
    const flags = this.flags;
    if ((flags & (RECOMPUTING | DIRTY)) !== 0) return;
    this.flags = flags | DIRTY;
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
