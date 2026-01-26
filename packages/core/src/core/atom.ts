import { ATOM_STATE_FLAGS, SMI_MAX } from '@/constants';
import { ReactiveDependency } from '@/core/base';
import { trackDependency } from '@/core/dep-tracking';
import { scheduler } from '@/internal/scheduler';
import { trackingContext } from '@/tracking';
import type { AtomOptions, Subscriber, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Internal {@link WritableAtom} implementation.
 * Extends {@link ReactiveDependency} to provide reactive state that can be observed and updated.
 */
class AtomImpl<T> extends ReactiveDependency<T> implements WritableAtom<T> {
  private _value: T;
  private _pendingOldValue: T | undefined;
  private _notifyTask: (() => void) | undefined;

  protected _fnSubs: ((newValue?: T, oldValue?: T) => void)[];
  protected _objSubs: Subscriber[];

  constructor(initialValue: T, sync: boolean) {
    super();
    this._value = initialValue;
    this._pendingOldValue = undefined;
    this._notifyTask = undefined;
    this._fnSubs = [];
    this._objSubs = [];

    // Group numeric flag initializations for stable hidden class transitions
    let flags = ATOM_STATE_FLAGS.IS_ATOM;
    if (sync) {
      flags |= ATOM_STATE_FLAGS.SYNC;
    }
    this.flags = flags;

    // Attach debug info in dev mode
    debug.attachDebugInfo(this, 'atom', this.id);
  }

  /**
   * Returns the current value and registers the atom as a dependency if in a tracking context.
   */
  get value(): T {
    const current = trackingContext.current;
    if (current) {
      trackDependency(this, current, this._fnSubs, this._objSubs);
    }
    return this._value;
  }

  /**
   * Sets a new value and schedules notifications if the value has changed.
   */
  set value(newValue: T) {
    const oldValue = this._value;
    // Accuracy prioritized: Object.is handles NaN and +0/-0 correctly
    if (Object.is(oldValue, newValue)) return;

    this._value = newValue;
    this.version = (this.version + 1) & SMI_MAX;

    const flags = this.flags;
    const subMask = ATOM_STATE_FLAGS.HAS_FN_SUBS | ATOM_STATE_FLAGS.HAS_OBJ_SUBS;
    if (flags & subMask) {
      this._scheduleNotification(oldValue, flags);
    }
  }

  /**
   * Schedules or flushes notifications based on sync mode and batching state.
   */
  private _scheduleNotification(oldValue: T, flags: number): void {
    // Optimization: If already scheduled, avoid redundant state updates and task scheduling.
    // This is critical for performance during multiple updates within a single batch.
    if (flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) {
      return;
    }

    this._pendingOldValue = oldValue;
    this.flags = flags |= ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    // Fast path for synchronous notification outside of explicit batches
    if (flags & ATOM_STATE_FLAGS.SYNC && !scheduler.isBatching) {
      this._flushNotifications();
      return;
    }

    // Lazy task creation to minimize memory overhead for idle atoms
    let task = this._notifyTask;
    if (!task) {
      task = this._notifyTask = () => this._flushNotifications();
    }
    scheduler.schedule(task);
  }

  /**
   * Flushes scheduled notifications and resets state for the next cycle.
   */
  private _flushNotifications(): void {
    const flags = this.flags;
    // Guard clause: Early exit if not scheduled or disposed to reduce nesting
    if (!(flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) || flags & ATOM_STATE_FLAGS.DISPOSED) {
      return;
    }

    const oldValue = this._pendingOldValue as T;
    const newValue = this._value;

    // Reset scheduled state before notification to ensure consistency if callbacks trigger updates
    this._pendingOldValue = undefined;
    this.flags &= ~ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    this._notifySubscribers(newValue, oldValue);
  }

  /**
   * Returns the current value without registering it as a dependency.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Disposes of the atom and releases all subscribers and tasks.
   */
  dispose(): void {
    if (this.flags & ATOM_STATE_FLAGS.DISPOSED) return;

    this.flags |= ATOM_STATE_FLAGS.DISPOSED;
    this._fnSubs = [];
    this._objSubs = [];
    this._value = undefined as T;
    this._pendingOldValue = undefined;
    this._notifyTask = undefined;
  }
}

/**
 * Creates a reactive atom holding mutable state.
 *
 * @param initialValue - The initial value of the atom.
 * @param options - Configuration options (sync: boolean).
 */
export function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options.sync ?? false);
}
