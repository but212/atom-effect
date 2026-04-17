import { ATOM_STATE_FLAGS, IS_DEV } from '@/constants';
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

    if (IS_DEV) {
      debug.attachDebugInfo(this, 'atom', this.id, options.name);
    }
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

    if (IS_DEV) {
      debug.trackUpdate(this.id, debug.getDebugName(this));
    }

    const currentFlags = this.flags;
    const SCHED_BIT = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    // 1. Guard: Skip if already scheduled or no subscribers
    if ((currentFlags & SCHED_BIT) !== 0) return;

    // 2. Schedule Notification
    this._pendingOldValue = oldValue;
    const nextFlags = currentFlags | SCHED_BIT;
    this.flags = nextFlags;

    // 3. Choice: Flush now or Schedule for later
    const SYNC_BIT = ATOM_STATE_FLAGS.SYNC;
    if ((nextFlags & SYNC_BIT) !== 0 && !scheduler.isBatching) {
      if (this._notifying === 0) {
        this._flushNotifications();
      }
      return;
    }

    scheduler.schedule(this);
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
    const LOOP_MASK = SCHED_BIT | DISP_BIT;

    let flags = this.flags;
    // Loop to handle re-entrant sync updates in breadth-first order
    while ((flags & LOOP_MASK) === SCHED_BIT) {
      const oldValue = this._pendingOldValue as T;
      this._pendingOldValue = undefined;

      // Update bitwise state
      this.flags = flags &= ~SCHED_BIT;

      // Net-zero check: if value returned to original during batching, skip notification
      const currentVal = this._value;
      if (!this._equal(currentVal, oldValue)) {
        this._notifySubscribers(currentVal, oldValue);
      }

      flags = this.flags;
      // Only continue looping if we are in sync mode and not batching.
      if ((flags & SYNC_BIT) === 0 || scheduler.isBatching) {
        break;
      }
    }
  }

  peek(): T {
    return this._value;
  }

  dispose(): void {
    const flags = this.flags;
    const DISP_BIT = ATOM_STATE_FLAGS.DISPOSED;
    if ((flags & DISP_BIT) !== 0) return;

    this.flags = flags | DISP_BIT;
    this._slots?.clear();

    // Release references
    this._value = undefined as T;
    this._pendingOldValue = undefined;
    this._equal = Object.is; // Reset to default
  }

  protected override _deepDirtyCheck(): boolean {
    return false;
  }

  // [Symbol.dispose](): void {
  //   this.dispose();
  // }
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
