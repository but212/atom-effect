import { ATOM_STATE_FLAGS, IS_DEV } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { BRAND, BrandFlags } from '@/symbols';
import type { AtomOptions, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';
import { nextVersion, scheduler } from './scheduler';
import { trackingContext } from './tracking';

/**
 * Internal {@link WritableAtom} implementation.
 *
 * Logic: Manages a single piece of mutable state and coordinates notification
 * scheduling for its subscribers. Participation in the dependency graph is
 * handled via the `value` getter/setter.
 */
class AtomImpl<T> extends ReactiveNode<T> implements WritableAtom<T> {
  private _value: T;
  /** Old value for notifications */
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

  /**
   * Retrieves current value and registers a dependency if called in a reactive context.
   */
  get value(): T {
    const ctx = trackingContext.current;
    // Logic: Automatic dependency tracking during execution of Computeds/Effects.
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

    this._scheduleNotification(oldValue);
  }

  /**
   * Logic: Atom State Synchronization
   * Orchestrates notification scheduling. If synchronization is required (via `sync` option)
   * and no batch is active, it flushes immediately; otherwise, it delegates to the global
   * scheduler for microtask-based delivery.
   */
  private _scheduleNotification(oldValue: T): void {
    const currentFlags = this.flags;
    const SCHED_BIT = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    if ((currentFlags & SCHED_BIT) !== 0) return;
    const slots = this._slots;
    if (slots === null || slots.size === 0) return;

    this._pendingOldValue = oldValue;
    const nextFlags = currentFlags | SCHED_BIT;
    this.flags = nextFlags;

    const SYNC_BIT = ATOM_STATE_FLAGS.SYNC;
    if ((nextFlags & SYNC_BIT) !== 0 && !scheduler.isBatching) {
      if (this._notifying === 0) {
        this._flushNotifications();
        return;
      }
    }

    scheduler.schedule(this);
  }

  /** @internal */
  execute(): void {
    this._flushNotifications();
  }

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

      this.flags = flags &= ~SCHED_BIT;

      // Optimization: Net-zero check: if value returned to original during batching, skip notification.
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

  /**
   * Accesses the value without triggering dependency tracking.
   */
  peek(): T {
    return this._value;
  }

  /**
   * Cleans up the atom and releases references to its state.
   *
   * Caution: Disposed atoms will throw if accessed or modified.
   */
  dispose(): void {
    const flags = this.flags;
    const DISP_BIT = ATOM_STATE_FLAGS.DISPOSED;
    if ((flags & DISP_BIT) !== 0) return;

    this.flags = flags | DISP_BIT;
    this._slots?.clear();

    // Reason: Clear references to prevent memory leaks in long-lived applications.
    this._value = undefined as T;
    this._pendingOldValue = undefined;
    this._equal = Object.is; // Reset to default
  }

  protected override _deepDirtyCheck(): boolean {
    return false;
  }
}

/**
 * Creates a reactive atom holding mutable state.
 *
 * When to use:
 * - When you need a source of truth for a specific piece of state.
 * - When that state needs to be updated manually (unlike Computeds).
 *
 * @param initialValue - The initial value of the atom.
 * @param options - Configuration options for sync mode, custom equality, or naming.
 * @returns A writable reactive atom.
 *
 * @example
 * ```typescript
 * const count = atom(0);
 * console.log(count.value); // 0
 * count.value++;
 * ```
 */
export function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options);
}
