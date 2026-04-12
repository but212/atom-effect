import { ATOM_STATE_FLAGS } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { BRAND, BrandFlags } from '@/symbols';
import type { AtomOptions, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';
import { nextVersion, scheduler } from './scheduler';
import { trackingContext } from './tracking';

/**
 * Internal {@link WritableAtom} implementation.
 */
class AtomImpl<T> extends ReactiveNode<T> implements WritableAtom<T> {
  private _value: T;
  /** Old value for notifications */
  private _pendingOldValue: T | undefined;
  /** Equality comparator */
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

  get value(): T {
    const ctx = trackingContext.current;
    if (ctx != null) {
      ctx.addDependency(this);
    }
    return this._value;
  }

  set value(newValue: T) {
    const oldValue = this._value;
    if (this._equal(oldValue, newValue)) return;

    this._value = newValue;
    this.version = nextVersion(this.version);
    debug.trackUpdate(this.id, debug.getDebugName(this));

    let flags = this.flags;
    // 1. Double check: schedule pending or no slots
    if ((flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) !== 0) return;

    const slots = this._slots;
    if (slots == null || slots.size === 0) return;

    this._pendingOldValue = oldValue;
    this.flags = flags |= ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    // 2. Schedule or flush (inline bitwise)
    if ((flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !scheduler.isBatching) {
      // If not already notifying, start the flush loop.
      // If already notifying, the existing loop will pick up the new flag.
      if (this._notifying === 0) {
        this._flushNotifications();
      }
    } else {
      scheduler.schedule(this);
    }
  }

  /**
   * Executes scheduled notification.
   * @internal
   */
  execute(): void {
    this._flushNotifications();
  }

  /**
   * Triggers subscribers.
   */
  private _flushNotifications(): void {
    const SCHED_BIT = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;
    const DISP_BIT = ATOM_STATE_FLAGS.DISPOSED;
    const SYNC_BIT = ATOM_STATE_FLAGS.SYNC;

    // Loop to handle re-entrant sync updates in breadth-first order
    while ((this.flags & (SCHED_BIT | DISP_BIT)) === SCHED_BIT) {
      const oldValue = this._pendingOldValue as T;
      this._pendingOldValue = undefined;
      this.flags &= ~SCHED_BIT;

      // Net-zero check: if value returned to original during batching, skip notification
      if (!this._equal(this._value, oldValue)) {
        this._notifySubscribers(this._value, oldValue);
      }

      // Only continue looping if we are in sync mode and not batching.
      // For async mode, the scheduler handles subsequent executions.
      if ((this.flags & SYNC_BIT) === 0 || scheduler.isBatching) {
        break;
      }
    }
  }

  peek(): T {
    return this._value;
  }

  dispose(): void {
    const flags = this.flags;
    if ((flags & ATOM_STATE_FLAGS.DISPOSED) !== 0) return;

    this._slots?.clear();
    this.flags = flags | ATOM_STATE_FLAGS.DISPOSED;
    // Release references
    this._value = undefined as T;
    this._pendingOldValue = undefined;
    this._equal = Object.is; // Reset to default
  }

  protected override _deepDirtyCheck(): boolean {
    return false;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

/**
 * Creates a reactive atom holding mutable state.
 *
 * @param initialValue - The initial value of the atom.
 * @param options - Configuration options (sync: boolean).
 */
export function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options);
}
