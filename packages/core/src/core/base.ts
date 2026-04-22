import { COMPUTED_STATE_FLAGS, EPOCH_CONSTANTS, IS_DEV, SMI_MAX } from '@/constants';
import { AtomError, ERROR_MESSAGES, wrapError } from '@/errors';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';
import { type DepSlotBuffer, SlotBuffer } from './buffers';
import { Subscription } from './tracking';

/**
 * A unified base class for all reactive primitives, including Atoms, Computeds, and Effects.
 *
 * When to use:
 * - As an internal base for implementing new reactive primitives.
 * - When a custom primitive requires integration with the core dependency graph.
 *
 * Optimization: This class is designed to maintain a consistent object shape across all
 * reactive nodes, which assists JavaScript engines in optimizing property access via
 * Hidden Class Monomorphism.
 *
 * @template T - The type of value produced by the node, used for subscriber notifications.
 */
export abstract class ReactiveNode<T> {
  /** Internal bitfield representing the current state of the node. */
  flags: number;
  /** A monotonically increasing counter representing the version of the node's value. */
  version: number;
  /** The epoch ID of the last time this node was visited during a dependency walk. */
  _lastSeenEpoch: number;
  /** A tag used by the scheduler to deduplicate execution within a single flush cycle. */
  _nextEpoch: number | undefined;
  /** A unique identifier used for debugging and graph traversal. */
  readonly id: DependencyId;

  /**
   * Buffered storage for active subscribers.
   * @internal
   */
  _slots: SlotBuffer<Subscription<T>> | null;

  /** Re-entry guard counter used during subscriber notification loops. */
  _notifying: number;

  /**
   * Buffered storage for captured dependencies.
   * @internal
   */
  _deps: DepSlotBuffer | null;
  /** Index of the last known dirty dependency, providing an O(1) validation path. */
  _hotIndex: number;

  constructor() {
    // Optimization: Field initialization order is managed to maintain a consistent V8 object layout.
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
    this._notifying = 0;
    this._hotIndex = -1;
    this.id = generateId() & SMI_MAX;

    this._nextEpoch = undefined;
    this._slots = null;
    this._deps = null;
  }

  /**
   * Indicates whether the node has been explicitly disposed.
   * @internal
   */
  get isDisposed(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0;
  }

  /**
   * Indicates whether the node is a computed atom.
   * @internal
   */
  get isComputed(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0;
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
    if (!isFn && (listener === null || typeof (listener as Subscriber).execute !== 'function')) {
      throw wrapError(
        new TypeError('Invalid subscriber'),
        AtomError,
        ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
      );
    }

    let slots = this._slots;
    if (slots === null) {
      slots = new SlotBuffer<Subscription<T>>();
      this._slots = slots;
    }

    if (slots.length > 0) {
      // Optimization: Unrolled membership check for the inline slots (s0-s3) to minimize traversal overhead.
      if (
        (slots._s0 !== null && (slots._s0.fn === listener || slots._s0.sub === listener)) ||
        (slots._s1 !== null && (slots._s1.fn === listener || slots._s1.sub === listener)) ||
        (slots._s2 !== null && (slots._s2.fn === listener || slots._s2.sub === listener)) ||
        (slots._s3 !== null && (slots._s3.fn === listener || slots._s3.sub === listener))
      ) {
        if (IS_DEV) console.warn(`[atom-effect] Duplicate subscription ignored on node ${this.id}`);
        return () => {};
      }

      const ov = slots._overflow;
      if (ov !== null) {
        const len = ov.length;
        // Logic: Hoisted invariant check (isFn) outside the loop to reduce branching in the hot path.
        if (isFn) {
          for (let i = 0; i < len; i++) {
            const s = ov[i];
            if (s !== null && s?.fn === listener) {
              if (IS_DEV)
                console.warn(`[atom-effect] Duplicate subscription ignored on node ${this.id}`);
              return () => {};
            }
          }
        } else {
          for (let i = 0; i < len; i++) {
            const s = ov[i];
            if (s !== null && s?.sub === listener) {
              if (IS_DEV)
                console.warn(`[atom-effect] Duplicate subscription ignored on node ${this.id}`);
              return () => {};
            }
          }
        }
      }
    }

    const link = new Subscription<T>(
      isFn ? (listener as (newValue?: T, oldValue?: T) => void) : undefined,
      !isFn ? (listener as Subscriber) : undefined
    );

    slots.push(link);
    return () => this._unsubscribe(link);
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
    if (this._notifying === 0) {
      slots.compact();
    }
  }

  /**
   * Returns the number of active subscribers for this node.
   *
   * When to use:
   * - To monitor subscription health or detect leaks during development.
   * - To implement conditional logic based on node observability.
   */
  subscriberCount(): number {
    const slots = this._slots;
    return slots === null ? 0 : slots.length;
  }

  /**
   * Dispatches notifications to all registered subscribers.
   *
   * Logic: Increments the `_notifying` guard to protect the subscriber buffer from
   * structural changes during iteration. Error handling is encapsulated per subscriber
   * to ensure a single failing listener does not terminate the entire notification cycle.
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const slots = this._slots;
    if (slots === null || slots.length === 0) return;

    this._notifying++;
    try {
      // Optimization: Prioritizes inline slots (s0-s3) for notification delivery.
      if (slots._s0 !== null) {
        try {
          slots._s0.notify(newValue, oldValue);
        } catch (e) {
          this._logNotifyError(e);
        }
      }
      if (slots._s1 !== null) {
        try {
          slots._s1.notify(newValue, oldValue);
        } catch (e) {
          this._logNotifyError(e);
        }
      }
      if (slots._s2 !== null) {
        try {
          slots._s2.notify(newValue, oldValue);
        } catch (e) {
          this._logNotifyError(e);
        }
      }
      if (slots._s3 !== null) {
        try {
          slots._s3.notify(newValue, oldValue);
        } catch (e) {
          this._logNotifyError(e);
        }
      }

      const ov = slots._overflow;
      if (ov !== null) {
        for (let i = 0, len = ov.length; i < len; i++) {
          const sub = ov[i];
          if (sub !== null) {
            try {
              sub?.notify(newValue, oldValue);
            } catch (e) {
              this._logNotifyError(e);
            }
          }
        }
      }
    } finally {
      if (--this._notifying === 0) {
        slots.compact();
      }
    }
  }

  private _logNotifyError(err: unknown): void {
    console.error(wrapError(err, AtomError, ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED));
  }

  // ============================================================================
  // Consumer Logic (Dependency Validation)
  // ============================================================================

  /**
   * Determines if the node requires re-evaluation due to dependency changes.
   *
   * Logic: Implements a double-phase validation. It first attempts an O(1) check of the
   * dependency stored at `_hotIndex`. If stable, it falls back to a deep structural walk.
   */
  protected _isDirty(): boolean {
    const deps = this._deps;
    if (deps === null || deps.length === 0) return false;

    const hotIndex = this._hotIndex;
    if (hotIndex !== -1) {
      const hotLink = deps.at(hotIndex);
      if (hotLink !== null && hotLink.node.version !== hotLink.version) {
        return true;
      }
    }

    return this._deepDirtyCheck();
  }

  /**
   * Performs an exhaustive validation of the full dependency chain.
   */
  protected abstract _deepDirtyCheck(): boolean;
}
