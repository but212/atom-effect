import { ATOM_STATE_FLAGS, SMI_MAX } from '@/constants';
import { ReactiveDependency } from '@/core/base';
import { type SubscriberLink, trackDependency } from '@/core/dep-tracking';
import { scheduler } from '@/internal/scheduler';
import { trackingContext } from '@/tracking';
import type { AtomOptions, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

// Pre-compute mask to avoid repeated bitwise operations during rapid updates
const SUBS_MASK = ATOM_STATE_FLAGS.HAS_FN_SUBS | ATOM_STATE_FLAGS.HAS_OBJ_SUBS;

/**
 * Internal {@link WritableAtom} implementation.
 */
class AtomImpl<T> extends ReactiveDependency<T> implements WritableAtom<T> {
  private _value: T;
  private _pendingOldValue: T | undefined = undefined;
  private _notifyTask: (() => void) | undefined = undefined;
  protected _subscribers: SubscriberLink<T>[] = [];

  constructor(initialValue: T, sync: boolean) {
    super();
    this._value = initialValue;
    if (sync) this.flags |= ATOM_STATE_FLAGS.SYNC;
    debug.attachDebugInfo(this, 'atom', this.id);
  }

  get value(): T {
    const current = trackingContext.current;
    if (current) trackDependency(this, current, this._subscribers);
    return this._value;
  }

  set value(newValue: T) {
    const oldValue = this._value;
    if (oldValue === newValue || Object.is(oldValue, newValue)) return;

    this._value = newValue;
    this.version = (this.version + 1) & SMI_MAX;

    const flags = this.flags;
    if ((flags & SUBS_MASK) === 0 || flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) return;

    this._pendingOldValue = oldValue;
    this.flags = flags | ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    if (flags & ATOM_STATE_FLAGS.SYNC && !scheduler.isBatching) {
      this._flushNotifications();
      return;
    }

    if (!this._notifyTask) this._notifyTask = () => this._flushNotifications();
    scheduler.schedule(this._notifyTask);
  }

  private _flushNotifications(): void {
    const flags = this.flags;
    if (!(flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) || flags & ATOM_STATE_FLAGS.DISPOSED)
      return;

    const oldValue = this._pendingOldValue as T;
    this._pendingOldValue = undefined;
    this.flags &= ~ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    this._notifySubscribers(this._value, oldValue);
  }

  peek(): T {
    return this._value;
  }

  dispose(): void {
    if (this.flags & ATOM_STATE_FLAGS.DISPOSED) return;

    this._subscribers.length = 0;
    this.flags |= ATOM_STATE_FLAGS.DISPOSED;
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
