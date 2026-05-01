import { SlotBuffer } from '@but212/atom-effect-utils';
import { COMPUTED_STATE_FLAGS, EPOCH_CONSTANTS, IS_DEV, SMI_MAX } from '@/constants';
import { AtomError, ERROR_MESSAGES, wrapError } from '@/errors';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';
import { type DepBufferState, isBufferDirty } from './buffers';
import { createSubscription, notifySubscription, type Subscription } from './tracking';

/**
 * A unified base class for all reactive primitives, including Atoms, Computeds, and Effects.
 *
 * When to use:
 * - As an internal base for implementing new reactive primitives.
 * - When a custom primitive requires integration with the core dependency graph.
 *
 * Optimization:
 * Designed with a fixed field layout to maintain Hidden Class Monomorphism in V8.
 * Avoid adding dynamic properties to instances to prevent de-optimization.
 *
 * @template T - The type of value produced by the node, used for subscriber notifications.
 */
export abstract class ReactiveNode<T> {
  /**
   * Internal bitfield representing the current state (Dirty, Computed, Disposed).
   * Logic: Direct bitwise operations are used for high-frequency state checks.
   */
  flags: number;

  /**
   * A monotonically increasing counter representing the version of the node's value.
   * Logic: Allows consumers to quickly verify if their cached values are stale.
   */
  version: number;

  /**
   * The epoch ID of the last time this node was visited during a dependency walk.
   * Logic: Prevents redundant visits and infinite loops during graph traversal.
   */
  _lastSeenEpoch: number;

  /**
   * A tag used by the scheduler to deduplicate execution within a single flush cycle.
   * @internal
   */
  _nextEpoch: number | undefined;

  /**
   * Unique identifier used for debugging and graph traversal.
   * Optimization: Uses SMI (Small Integer) range for memory efficiency and faster comparisons.
   */
  readonly id: DependencyId;

  /**
   * Buffered storage for active subscribers.
   * Logic: Uses `SlotBuffer` to support O(1) removal and deferred structural updates.
   * @internal
   */
  _slots: SlotBuffer<Subscription<T>> | null;

  /**
   * Re-entry guard counter used during subscriber notification loops.
   * Constraint: Must be > 0 during `_notifySubscribers` to block `_slots.compact()`.
   */
  _notifying: number;

  /**
   * Buffered storage for captured dependencies.
   * @internal
   */
  _deps: DepBufferState | null;

  constructor() {
    // Optimization: Field initialization order matches the class declaration
    // to strictly enforce V8 object layout consistency.
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
    this._notifying = 0;
    this.id = generateId() & SMI_MAX;

    this._nextEpoch = undefined;
    this._slots = null;
    this._deps = null;
  }

  /**
   * Indicates whether the node has been explicitly disposed.
   */
  get isDisposed(): boolean {
    return this._hasFlag(COMPUTED_STATE_FLAGS.DISPOSED);
  }

  /**
   * Indicates whether the node is a computed atom.
   */
  get isComputed(): boolean {
    return this._hasFlag(COMPUTED_STATE_FLAGS.IS_COMPUTED);
  }

  private _hasFlag(flag: number): boolean {
    return (this.flags & flag) !== 0;
  }

  /**
   * Indicates whether the node or its dependency sub-graph is currently in an error state.
   * @internal
   */
  get hasError(): boolean {
    return false;
  }

  // ============================================================================
  // Producer Logic (Subscriber Management)
  // ============================================================================

  /**
   * Registers a subscriber to be notified when the node's value changes.
   *
   * When to use:
   * - To observe value changes manually outside of reactive contexts (e.g., in UI adapters).
   *
   * @param listener - A callback function or a Subscriber object.
   * @returns A cleanup function to terminate the subscription.
   * @throws {AtomError} If the provided listener is not a function or a valid Subscriber.
   *
   * @example
   * ```typescript
   * const unsub = node.subscribe((next, prev) => {
   *   console.log(`Value changed from ${prev} to ${next}`);
   * });
   *
   * // Later:
   * unsub();
   * ```
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const isFn = typeof listener === 'function';

    // Constraint: Validates input to ensure consistent execution during notification.
    if (!isFn && (listener == null || typeof (listener as Subscriber).execute !== 'function')) {
      throw wrapError(
        new TypeError('Invalid subscriber'),
        AtomError,
        ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
      );
    }

    let slots = this._slots;
    if (slots === null) {
      this._slots = slots = new SlotBuffer<Subscription<T>>();
    } else if (this._hasSubscription(listener)) {
      if (IS_DEV) console.warn(`[atom-effect] Duplicate subscription ignored on node ${this.id}`);
      return () => {};
    }

    const link = createSubscription<T>(
      isFn ? (listener as (newValue?: T, oldValue?: T) => void) : undefined,
      !isFn ? (listener as Subscriber) : undefined
    );

    slots.push(link);
    return () => this._unsubscribe(link);
  }

  private _hasSubscription(listener: unknown): boolean {
    const slots = this._slots;
    if (!slots || slots.length === 0) return false;

    const length = slots.capacity;
    for (let i = 0; i < length; i++) {
      const link = slots.at(i);
      if (link && (link.fn === listener || link.sub === listener)) return true;
    }
    return false;
  }

  /**
   * Internal removal of a subscription link.
   *
   * Caution: Compaction is deferred if a notification loop is currently active to
   * prevent index shifting during iteration.
   */
  protected _unsubscribe(link: Subscription<T>): void {
    const slots = this._slots;
    if (slots === null) return;

    slots.remove(link);
    // Logic: Only compact if we are not currently iterating over the slots.
    if (this._notifying === 0) {
      slots.compact();
    }
  }

  /**
   * Returns the number of active subscribers for this node.
   *
   * When to use:
   * - To monitor subscription health or detect leaks during development.
   */
  subscriberCount(): number {
    return this._slots?.length ?? 0;
  }

  /**
   * Dispatches notifications to all registered subscribers.
   *
   * Logic:
   * Increments the `_notifying` guard to protect the subscriber buffer from
   * structural changes during iteration. Error handling is encapsulated per subscriber
   * to ensure a single failing listener does not terminate the entire notification cycle.
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const slots = this._slots;
    if (!slots?.length) return;

    this._notifying++;
    try {
      slots.forEach((sub) => {
        if (sub) notifySubscription(sub, newValue, oldValue);
      });
    } finally {
      // Logic: Deferred compaction occurs here if unsubscribe was called during the loop.
      if (--this._notifying === 0) {
        slots.compact();
      }
    }
  }

  // ============================================================================
  // Consumer Logic (Dependency Validation)
  // ============================================================================

  /**
   * Determines if the node requires re-evaluation due to dependency changes.
   * Logic: Checks the status of the cached dependency buffer.
   */
  protected _isDirty(): boolean {
    return this._deps ? isBufferDirty(this._deps) : false;
  }

  /**
   * Performs an exhaustive validation of the full dependency chain.
   * Required for Computeds and Effects to handle deep dependency invalidation.
   */
  protected abstract _deepDirtyCheck(): boolean;
}
