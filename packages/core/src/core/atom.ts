import { ATOM_STATE_FLAGS } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { nextVersion } from '@/internal/epoch';
import { scheduler } from '@/internal/scheduler';
import { ATOM_BRAND, WRITABLE_BRAND } from '@/symbols';
import { trackingContext } from '@/tracking';
import type { AtomOptions, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Internal {@link WritableAtom} implementation.
 */
class AtomImpl<T> extends ReactiveNode<T> implements WritableAtom<T> {
  private _value: T;
  /** Old value for notifications */
  private _pendingOldValue: T | undefined;

  /** @internal */
  readonly [ATOM_BRAND] = true;
  /** @internal */
  readonly [WRITABLE_BRAND] = true;

  constructor(initialValue: T, sync: boolean) {
    super();
    this._value = initialValue;

    if (sync) {
      this.flags |= ATOM_STATE_FLAGS.SYNC;
    }

    debug.attachDebugInfo(this, 'atom', this.id);
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
    trackingContext.current?.addDependency(this);
    return this._value;
  }

  set value(newValue: T) {
    const oldValue = this._value;
    if (Object.is(oldValue, newValue)) return;

    this._value = newValue;
    this.version = nextVersion(this.version);

    // 1. Check if notifications are needed
    if ((this._slots?.size ?? 0) === 0 || this.isNotificationScheduled) {
      return;
    }

    this._pendingOldValue = oldValue;
    this.flags |= ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    // 2. Schedule or flush
    if (this.isSync && !scheduler.isBatching) {
      this._flushNotifications();
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
    // Guard: Spurious flush or already disposed
    if (!this.isNotificationScheduled || this.isDisposed) {
      return;
    }

    const oldValue = this._pendingOldValue as T;
    this._pendingOldValue = undefined;
    this.flags &= ~ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    this._notifySubscribers(this._value, oldValue);
  }

  peek(): T {
    return this._value;
  }

  dispose(): void {
    if (this.isDisposed) return;

    this._slots?.clear();
    this.flags |= ATOM_STATE_FLAGS.DISPOSED;
    // Release references
    this._value = undefined as T;
    this._pendingOldValue = undefined;
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
  return new AtomImpl(initialValue, options.sync ?? false);
}
