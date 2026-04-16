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
 * Computed atom implementation.
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
  private readonly _fn: () => T | Promise<T>;
  private readonly _defaultValue: T;
  private readonly _onError: ((error: Error) => void) | null;

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

  private get _hasErrorInternal(): boolean {
    return (this.flags & HAS_ERROR) !== 0;
  }

  private _track(): void {
    trackingContext.current?.addDependency(this);
  }

  get value(): T {
    const ctx = trackingContext.current;
    if (ctx !== null) ctx.addDependency(this);

    const flags = this.flags;
    // 1. Fast path: Stable and Resolved. Masking multiple flags for single-branch optimization.
    if ((flags & (RESOLVED | DIRTY | IDLE | DISPOSED | RECOMPUTING)) === RESOLVED) {
      return this._value;
    }

    // 2. Exception paths (Disposed, Cycles)
    if ((flags & DISPOSED) !== 0) throw new ComputedError(ERROR_MESSAGES.COMPUTED_DISPOSED);

    if ((flags & RECOMPUTING) !== 0) {
      const def = this._defaultValue;
      if (def !== (NO_DEFAULT_VALUE as T)) return def;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_CIRCULAR_DEPENDENCY);
    }

    // 3. Evaluation path (Lazy Stale Check)
    if ((flags & (DIRTY | IDLE)) !== 0) {
      const deps = this._deps;
      // Force computation if idle, forced, has no deps (initial), or deep check failed
      const shouldRecompute =
        (flags & (IDLE | FORCE_COMPUTE)) !== 0 || deps.size === 0 || this._isDirty();

      if (!shouldRecompute) {
        this.flags &= ~DIRTY;
      } else {
        this._recompute();
      }
      if ((this.flags & RESOLVED) !== 0) return this._value;
    }

    // 4. Async/Error handled after recomputation check
    const def = this._defaultValue;
    const hasDefault = def !== (NO_DEFAULT_VALUE as T);

    if ((this.flags & PENDING) !== 0) {
      if (hasDefault) return def;
      throw new ComputedError(ERROR_MESSAGES.COMPUTED_ASYNC_PENDING_NO_DEFAULT);
    }

    if ((this.flags & REJECTED) !== 0) {
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
    if (ctx !== null) ctx.addDependency(this);
    const flags = this.flags;
    if ((flags & RESOLVED) !== 0) return AsyncState.RESOLVED;
    if ((flags & PENDING) !== 0) return AsyncState.PENDING;
    if ((flags & REJECTED) !== 0) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  get hasError(): boolean {
    const ctx = trackingContext.current;
    if (ctx !== null) ctx.addDependency(this);

    const flags = this.flags;
    if ((flags & (REJECTED | HAS_ERROR)) !== 0) return true;

    const deps = this._deps;
    if (!deps.hasComputeds) return false;

    return untracked(() => {
      const size = deps.size;
      for (let i = 0; i < size; i++) {
        const link = deps.getAt(i);
        if (link?.node.hasError) return true;
      }
      return false;
    });
  }

  get isValid(): boolean {
    return !this.hasError;
  }

  get errors(): readonly Error[] {
    const ctx = trackingContext.current;
    if (ctx !== null) ctx.addDependency(this);

    const selfErr = this._error;
    const deps = this._deps;

    if (!deps.hasComputeds) {
      if (selfErr === null) return EMPTY_ERROR_ARRAY;
      return Object.freeze([selfErr]);
    }

    const collected: Error[] = [];
    if (selfErr !== null) collected.push(selfErr);

    untracked(() => {
      const size = deps.size;
      for (let i = 0; i < size; i++) {
        const link = deps.getAt(i);
        const depNode = link?.node;
        if (depNode !== undefined && (depNode.flags & IS_COMPUTED) !== 0) {
          this._accumulateErrors(depNode as unknown as ComputedAtomImpl<unknown>, collected);
        }
      }
    });

    return collected.length === 0 ? EMPTY_ERROR_ARRAY : Object.freeze(collected);
  }

  private _accumulateErrors(dep: ComputedAtomImpl<unknown>, collected: Error[]): void {
    const err = dep._error;
    if (err !== null && !collected.includes(err)) {
      collected.push(err);
    }

    const deps = dep._deps;
    if (!deps.hasComputeds) return;

    const size = deps.size;
    for (let i = 0; i < size; i++) {
      const link = deps.getAt(i);
      const node = link?.node;
      if (node !== undefined && (node.flags & IS_COMPUTED) !== 0) {
        this._accumulateErrors(node as unknown as ComputedAtomImpl<unknown>, collected);
      }
    }
  }

  get lastError(): Error | null {
    const ctx = trackingContext.current;
    if (ctx !== null) ctx.addDependency(this);
    return this._error;
  }

  get isPending(): boolean {
    const ctx = trackingContext.current;
    if (ctx !== null) ctx.addDependency(this);
    return (this.flags & PENDING) !== 0;
  }

  get isResolved(): boolean {
    const ctx = trackingContext.current;
    if (ctx !== null) ctx.addDependency(this);
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

  // [Symbol.dispose](): void {
  //   this.dispose();
  // }

  addDependency(dep: Dependency): void {
    const trackEpoch = this._trackEpoch;
    if (dep._lastSeenEpoch === trackEpoch) return;
    dep._lastSeenEpoch = trackEpoch;

    const trackIndex = this._trackCount++;
    const deps = this._deps;

    // Unrolled hot-path check for existing dependencies
    let existing: DependencyLink | null = null;
    if (trackIndex < 4) {
      if (trackIndex === 0) existing = deps._s0;
      else if (trackIndex === 1) existing = deps._s1;
      else if (trackIndex === 2) existing = deps._s2;
      else existing = deps._s3;
    } else {
      const ov = deps._overflow;
      if (ov !== null) existing = ov[trackIndex - 4] ?? null;
    }

    if (existing !== null && existing.node === dep) {
      existing.version = dep.version;
    } else if (deps.claimExisting(dep, trackIndex)) {
      // Version and relocation handled inside claimExisting
    } else {
      const link = new DependencyLink(dep, dep.version, dep.subscribe(this));
      deps.insertNew(trackIndex, link);
    }

    if ((dep.flags & IS_COMPUTED) !== 0) {
      deps.hasComputeds = true;
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
      const result = trackingContext.run(this, this._fn);
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
        } catch (commitErr) {
          if (IS_DEV) {
            console.warn('[atom-effect] _commitDeps failed during error recovery:', commitErr);
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
      (res) => {
        if (promiseId !== this._promiseId) return;
        if (this._isDirty()) return this._markDirty();

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

    if (!this.isRejected || this._error !== error) {
      this.version = nextVersion(this.version);
    }

    this._error = error;
    this.flags = (this.flags & ~(IDLE | DIRTY | PENDING | RESOLVED)) | REJECTED | HAS_ERROR;

    if (this._onError) {
      try {
        this._onError(error);
      } catch (e) {
        console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, e);
      }
    }

    this._notifySubscribers(undefined, undefined);
    if (throwErr) throw error;
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
   * Optimized with hot-index caching and unrolled scanning.
   */
  protected override _deepDirtyCheck(): boolean {
    const deps = this._deps;
    const size = deps.size;
    const hotIdx = this._hotIndex;

    return untracked(() => {
      // 1. Try last known dirty dependency first
      if (hotIdx !== -1 && hotIdx < size) {
        const link = deps.getAt(hotIdx);
        if (link !== null && this._checkLinkDirty(link)) return true;
      }

      // 2. Scan from beginning, skipping hot entry
      for (let i = 0; i < size; i++) {
        if (i === hotIdx) continue;
        const link = deps.getAt(i);
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
    const dep = link.node;
    if ((dep.flags & IS_COMPUTED) !== 0) {
      try {
        void (dep as { value: unknown }).value;
      } catch {
        if (IS_DEV) console.warn(`[atom-effect] Dependency #${dep.id} threw during check`);
      }
    }
    return dep.version !== link.version;
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
