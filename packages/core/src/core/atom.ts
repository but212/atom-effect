import type { SlotBuffer } from '@but212/atom-effect-utils';
import { ATOM_STATE_FLAGS, EPOCH_CONSTANTS, IS_DEV, SMI_MAX } from '@/constants';
import {
  nextVersion,
  nodeNotifySubscribers,
  nodeSubscribe,
  scheduler,
  schedulerIsBatching,
  schedulerSchedule,
  trackingContext,
} from '@/core/base';
import { BRAND, BrandFlags } from '@/symbols';
import type {
  AtomOptions,
  DepBufferState,
  DependencyId,
  ReactiveNode,
  Subscriber,
  Subscription,
  WritableAtom,
} from '@/types';
import { debug, generateId, nodeIsDisposed, nodeIsNotifying, nodeSubscriberCount } from '@/utils';

/**
 * Internal implementation of a {@link WritableAtom}.
 *
 * Logic: Dependency Graph Integration
 * As a leaf node, it doesn't have dependencies of its own but serves as
 * a source for `Computed` and `Effect` nodes.
 *
 * @internal
 */
class AtomImpl<T> implements WritableAtom<T>, ReactiveNode<T> {
  // ReactiveNode implementation
  flags: number = 0;
  version: number = 0;
  _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  _nextEpoch: number | undefined = undefined;
  readonly id: DependencyId = generateId() & SMI_MAX;
  _storage: {
    slots: SlotBuffer<Subscription<T>> | null;
    deps: DepBufferState | null;
  } = {
    slots: null,
    deps: null,
  };

  private _value: T;
  /** Optimization: Captured during mutation to allow net-zero suppression in batches. */
  private _pendingOldValue: T | undefined;
  private _equal: (a: T, b: T) => boolean;

  /** @internal */
  readonly [BRAND] = BrandFlags.Atom | BrandFlags.Writable;

  constructor(initialValue: T, options: AtomOptions<T>) {
    this._value = initialValue;
    this._equal = options.equal ?? Object.is;

    if (options.sync) {
      this.flags |= ATOM_STATE_FLAGS.SYNC;
    }

    debug.attachDebugInfo(this, 'atom', this.id, options.name);
  }

  get isDisposed(): boolean {
    return nodeIsDisposed(this);
  }

  get isComputed(): boolean {
    return false;
  }

  get isNotifying(): boolean {
    return nodeIsNotifying(this);
  }

  get hasError(): boolean {
    return false;
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

  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    return nodeSubscribe(this, listener);
  }

  subscriberCount(): number {
    return nodeSubscriberCount(this);
  }

  private _scheduleNotification(oldValue: T): void {
    const flags = this.flags;
    const SCHED = ATOM_STATE_FLAGS.NOTIFICATION_SCHEDULED;

    if ((flags & SCHED) !== 0 || !this._storage.slots?.length) return;

    this._pendingOldValue = oldValue;
    this.flags |= SCHED;

    if ((flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !schedulerIsBatching(scheduler)) {
      if (!this.isNotifying) this._flushNotifications();
    } else {
      schedulerSchedule(scheduler, this);
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
    const isSyncActive =
      (this.flags & ATOM_STATE_FLAGS.SYNC) !== 0 && !schedulerIsBatching(scheduler);

    while ((this.flags & MASK) === SCHED) {
      const prev = this._pendingOldValue as T;
      const next = this._value;

      this._pendingOldValue = undefined;
      this.flags &= ~SCHED;

      if (!this._equal(next, prev)) {
        nodeNotifySubscribers(this, next, prev);
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
    this._storage.slots?.clear();

    // Reason: Release references immediately to assist GC in large-scale state trees.
    this._value = undefined as T;
    this._pendingOldValue = undefined;
    this._equal = Object.is;
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
