import { ATOM_STATE_FLAGS } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { ATOM_BRAND, WRITABLE_BRAND } from '@/symbols';
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
    const ctx = trackingContext.current;
    if (ctx != null) {
      ctx.addDependency(this);
    }
    return this._value;
  }

  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;

    const oldValue = this._value;
    this._value = newValue;
    this.version = nextVersion(this.version);

    if (this._shouldNotify()) {
      this._pendingOldValue = oldValue;
      this.flags |= ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;
      this._requestFlush();
    }
  }

  /**
   * Determines if a notification should be initiated.
   */
  private _shouldNotify(): boolean {
    return !this.isNotificationScheduled && this.subscriberCount() > 0;
  }

  /**
   * Initiates the notification cycle based on sync/async strategy.
   */
  private _requestFlush(): void {
    if (this.isSync && !scheduler.isBatching) {
      this._flushNotifications();
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
   * Triggers subscribers using an iterative loop to handle sync recursion safely.
   */
  private _flushNotifications(): void {
    // Guards: Skip if disposed or already in a notification loop (re-entrancy)
    if (this.isDisposed || this._notifying > 0) return;

    while (this.isNotificationScheduled) {
      const oldValue = this._pendingOldValue as T;
      this._pendingOldValue = undefined;
      this.flags &= ~ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

      this._notifySubscribers(this._value, oldValue);
    }
  }

  peek(): T {
    return this._value;
  }

  dispose(): void {
    if (this.isDisposed) return;

    this._slots?.clear();
    this.flags |= ATOM_STATE_FLAGS.DISPOSED;

    // Release references for GC
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
