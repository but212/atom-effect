import { ATOM_STATE_FLAGS, IS_DEV } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { BRAND, BrandFlags } from '@/symbols';
import type { AtomOptions, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';
import { nextVersion, scheduler } from './scheduler';
import { trackingContext } from './tracking';

/** @internal */
const NOTIFY_ACTION = {
  FLUSH: 0,
  SCHEDULE: 1,
} as const;

/** @internal */
const STRATEGY_TABLE = [
  NOTIFY_ACTION.SCHEDULE, // !sync, !batching (0)
  NOTIFY_ACTION.SCHEDULE, // !sync, batching  (1)
  NOTIFY_ACTION.FLUSH, // sync, !batching  (2)
  NOTIFY_ACTION.SCHEDULE, // sync, batching   (3)
] as const;

/**
 * Internal implementation of a {@link WritableAtom}.
 *
 * Logic: Dependency Graph Integration
 * As a leaf node, it doesn't have dependencies of its own but serves as
 * a source for `Computed` and `Effect` nodes.
 *
 * @internal
 */
class AtomImpl<T> extends ReactiveNode<T> implements WritableAtom<T> {
  private _value: T;
  /** Optimization: Captured during mutation to allow net-zero suppression in batches. */
  private _pendingOldValue: T | undefined;
  private _equal: (a: T, b: T) => boolean;

  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Writable;

  constructor(initialValue: T, options: AtomOptions<T>) {
    super();
    this._value = initialValue;
    this._equal = options.equal ?? Object.is;

    if (options.sync) {
      this.flags |= ATOM_STATE_FLAGS.SYNC;
    }

    debug.attachDebugInfo(this, 'atom', this.id, options.name);
  }

  /** @internal */
  get isNotificationScheduled(): boolean {
    return (this.flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) !== 0;
  }

  /** @internal */
  get isSync(): boolean {
    return (this.flags & ATOM_STATE_FLAGS.SYNC) !== 0;
  }

  /**
   * Retrieves the current value and registers a dependency if called in a reactive context.
   */
  get value(): T {
    trackingContext.current?.addDependency(this);
    return this._value;
  }

  set value(newValue: T) {
    if (this._equal(this._value, newValue)) return;

    const oldValue = this._value;
    this._value = newValue;
    this.version = nextVersion(this.version);

    if (IS_DEV) debug.trackUpdate(this.id, debug.getDebugName(this));

    this._scheduleNotification(oldValue);
  }

  private _scheduleNotification(oldValue: T): void {
    const flags = this.flags;
    const SCHED = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    if ((flags & SCHED) !== 0 || !this._slots?.length) return;

    this._pendingOldValue = oldValue;
    this.flags |= SCHED;

    const syncBit = flags & ATOM_STATE_FLAGS.SYNC ? 2 : 0;
    const batchBit = scheduler.isBatching ? 1 : 0;

    if (STRATEGY_TABLE[syncBit | batchBit] === NOTIFY_ACTION.FLUSH) {
      if (!this.isNotifying) this._flushNotifications();
    } else {
      scheduler.schedule(this);
    }
  }

  /**
   * @internal - Entry point for the global scheduler.
   */
  execute(): void {
    this._flushNotifications();
  }

  private _flushNotifications(): void {
    const SCHED = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;
    const MASK = SCHED | ATOM_STATE_FLAGS.DISPOSED;
    const isSyncActive = (this.flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !scheduler.isBatching;

    while ((this.flags & MASK) === SCHED) {
      const prev = this._pendingOldValue as T;
      const next = this._value;

      this._pendingOldValue = undefined;
      this.flags &= ~SCHED;

      if (!this._equal(next, prev)) {
        this._notifySubscribers(next, prev);
      }

      if (!isSyncActive) break;
    }
  }

  /**
   * Accesses the value without registering a dependency.
   *
   * When to use:
   * - In event handlers or outside reactive contexts where tracking is undesirable.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Caution: Disposed atoms release their values and equality checks.
   * Subsequent access may result in undefined behavior or errors.
   */
  dispose(): void {
    const DISP = ATOM_STATE_FLAGS.DISPOSED;
    if ((this.flags & DISP) !== 0) return;

    this.flags |= DISP;
    this._slots?.clear();

    // Reason: Release references immediately to assist GC in large-scale state trees.
    this._value = undefined as T;
    this._pendingOldValue = undefined;
    this._equal = Object.is;
  }

  /**
   * Logic: Atoms are leaf nodes; they change only via explicit assignment,
   * so they never require upstream dirty checking.
   */
  protected override _deepDirtyCheck(): boolean {
    return false;
  }
}

/**
 * Creates a reactive atom holding mutable state.
 *
 * When to use:
 * - As a primary source of truth for local or global state.
 * - When state needs to be updated manually via `.value = ...`.
 *
 * @param initialValue - The starting value.
 * @param options - Configuration for custom equality or synchronous delivery.
 *
 * @example
 * ```typescript
 * const count = atom(0);
 * count.value++; // Triggers downstream updates
 * ```
 */
export function atom<T>(initialValue: T, options: AtomOptions<T> = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options);
}
