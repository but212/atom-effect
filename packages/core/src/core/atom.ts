import { NODE_FLAGS, NODE_MASKS } from '@/constants';
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
      this.set(NODE_FLAGS.ATOM_SYNC);
    }

    debug.attachDebugInfo(this, 'atom', this.id);
  }

  /** @internal */
  get isNotificationScheduled(): boolean {
    return this.has(NODE_FLAGS.ATOM_NOTIFY_PENDING);
  }

  /** @internal */
  get isSync(): boolean {
    return this.has(NODE_FLAGS.ATOM_SYNC);
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

    // 1. Double check: schedule pending or no slots
    if (this.has(NODE_FLAGS.ATOM_NOTIFY_PENDING)) return;

    const slots = this._slots;
    if (slots == null || slots.size === 0) return;

    this._pendingOldValue = oldValue;
    this.set(NODE_FLAGS.ATOM_NOTIFY_PENDING);

    // 2. Schedule or flush (inline bitwise)
    if (this.has(NODE_FLAGS.ATOM_SYNC) && !scheduler.isBatching) {
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
    // Use a single bitmask check for high-performance hot path
    if ((flags & NODE_MASKS.ATOM_FLUSH_GUARD) !== NODE_FLAGS.ATOM_NOTIFY_PENDING) {
      return;
    }

    const oldValue = this._pendingOldValue as T;
    this._pendingOldValue = undefined;
    this.clear(NODE_FLAGS.ATOM_NOTIFY_PENDING);

    this._notifySubscribers(this._value, oldValue);
  }

  peek(): T {
    return this._value;
  }

  dispose(): void {
    if (this.has(NODE_FLAGS.DISPOSED)) return;

    this._slots?.clear();
    this.set(NODE_FLAGS.DISPOSED);

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
