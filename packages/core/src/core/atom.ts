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
    const ctx = trackingContext.current;
    if (ctx != null) {
      ctx.addDependency(this);
    }
    return this._value;
  }

  set value(newValue: T) {
    const oldValue = this._value;
    if (Object.is(oldValue, newValue)) return;

    this._value = newValue;
    this.version = nextVersion(this.version);

    const flags = this.flags;
    // 1. Double check: schedule pending or no slots
    if ((flags & ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED) !== 0) return;

    const slots = this._slots;
    if (slots == null || slots.size === 0) return;

    this._pendingOldValue = oldValue;
    this.flags = flags | ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    // 2. Schedule or flush (inline bitwise)
    if ((flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !scheduler.isBatching) {
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
   * Triggers subscribers.
   */
  private _flushNotifications(): void {
    const flags = this.flags;
    // Guard: Combined bitwise check for NOTIFICATION_SCHEDULED and not DISPOSED
    if (
      (flags & (ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED | ATOM_STATE_FLAGS.DISPOSED)) !==
      ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED
    ) {
      return;
    }

    const oldValue = this._pendingOldValue as T;
    this._pendingOldValue = undefined;
    this.flags = flags & ~ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    this._notifySubscribers(this._value, oldValue);
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
