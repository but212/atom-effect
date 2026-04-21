import { COMPUTED_STATE_FLAGS, EPOCH_CONSTANTS, IS_DEV, SMI_MAX } from '@/constants';
import { AtomError, ERROR_MESSAGES, wrapError } from '@/errors';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';
import { type DepSlotBuffer, SlotBuffer } from './buffers';
import { Subscription } from './tracking';

/**
 * Unified base class for all reactive nodes (Atoms, Computeds, Effects).
 *
 * When to use:
 * - Internal base for implementing Atoms, Computeds, or Effects.
 * - When a custom reactive primitive needs to integrate with the dependency graph.
 *
 * Optimization: Optimized for V8 Hidden Class Monomorphism by having a single, consistent
 * object shape for all reactive logic.
 *
 * @template T - The type of value produced by this node (used for subscriptions).
 */
export abstract class ReactiveNode<T> {
  /** [Producer/Consumer] State flags */
  flags: number;
  /** [Producer/Consumer] Version counter */
  version: number;
  /** [Producer/Consumer] Last access epoch */
  _lastSeenEpoch: number;
  /** [Context] Scheduler epoch tag */
  _nextEpoch: number | undefined;
  /** [Debug] Unique ID for identify node in tracking maps */
  readonly id: DependencyId;

  /**
   * [Producer] Managed subscribers.
   */
  _slots: SlotBuffer<Subscription<T>> | null;

  /** [Producer] Re-entry guard for notification loop. */
  _notifying: number;

  /**
   * [Consumer] Managed dependencies.
   */
  _deps: DepSlotBuffer | null;
  /** [Consumer] O(1) Hot-path dependency index for rapid dirty checks. */
  _hotIndex: number;

  constructor() {
    // Optimization: Reordered for V8 Hidden Class (integers/numbers first)
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
    this._notifying = 0;
    this._hotIndex = -1;
    this.id = generateId() & SMI_MAX;

    // References/Nullable last
    this._nextEpoch = undefined;
    this._slots = null;
    this._deps = null;
  }

  /**
   * Whether the node has been disposed.
   * @internal
   */
  get isDisposed(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0; // Bit 0: DISPOSED
  }

  /**
   * Whether the node is a computed atom.
   * @internal
   */
  get isComputed(): boolean {
    return (this.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0; // Bit 1: IS_COMPUTED
  }

  /**
   * Whether the node currently has an error.
   * @internal
   */
  get hasError(): boolean {
    return false;
  }

  // ============================================================================
  // Producer Logic (Subscriber Management)
  // ============================================================================

  /**
   * Adds subscriber for notifications.
   *
   * When to use:
   * - When manual observation of value changes is required outside of reactive contexts.
   *
   * @param listener - The function or Subscriber object to receive updates.
   * @returns Unsubscribe function to stop receiving notifications.
   * @throws {AtomError} If the listener is neither a function nor a valid Subscriber.
   *
   * @example
   * const node = someReactiveNode;
   * const unsub = node.subscribe((next, prev) => {
   *   console.log(`Changed from ${prev} to ${next}`);
   * });
   * // Later...
   * unsub();
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const isFn = typeof listener === 'function';
    // Logic: Guard clause to ensure type safety before further processing.
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

    // Optimization: Skip duplicate check if empty
    if (slots.size > 0) {
      let duplicate = false;

      // Optimization: Unrolled check using unified comparison to reduce branching.
      // Since Subscription stores fn/sub and one is always undefined, we can check both.
      if (
        (slots._s0 !== null && (slots._s0.fn === listener || slots._s0.sub === listener)) ||
        (slots._s1 !== null && (slots._s1.fn === listener || slots._s1.sub === listener)) ||
        (slots._s2 !== null && (slots._s2.fn === listener || slots._s2.sub === listener)) ||
        (slots._s3 !== null && (slots._s3.fn === listener || slots._s3.sub === listener))
      ) {
        duplicate = true;
      } else {
        const ov = slots._overflow;
        if (ov !== null) {
          const len = ov.length;
          // Optimization: Hoisted invariant check (isFn) to avoid branching inside the loop.
          if (isFn) {
            for (let i = 0; i < len; i++) {
              const s = ov[i];
              if (s !== null && s?.fn === listener) {
                duplicate = true;
                break;
              }
            }
          } else {
            for (let i = 0; i < len; i++) {
              const s = ov[i];
              if (s !== null && s?.sub === listener) {
                duplicate = true;
                break;
              }
            }
          }
        }
      }

      if (duplicate) {
        if (IS_DEV) console.warn(`[atom-effect] Duplicate subscription ignored on node ${this.id}`);
        return () => {};
      }
    }

    const link = new Subscription<T>(
      isFn ? (listener as (newValue?: T, oldValue?: T) => void) : undefined,
      !isFn ? (listener as Subscriber) : undefined
    );

    slots.add(link);
    return () => this._unsubscribe(link);
  }

  protected _unsubscribe(link: Subscription<T>): void {
    const slots = this._slots;
    if (slots === null) return;

    slots.remove(link);
    if (this._notifying === 0) {
      slots.compact();
    }
  }

  /**
   * Returns current subscriber count.
   *
   * When to use:
   * - Monitoring subscription leaks during development.
   * - Conditional logic that depends on tracking state.
   *
   * @returns The number of active subscribers.
   *
   * @example
   * if (node.subscriberCount() > 0) {
   *   console.log('Node is currently being observed');
   * }
   */
  subscriberCount(): number {
    const slots = this._slots;
    return slots === null ? 0 : slots.size;
  }

  /**
   * Notifies all subscribers about a value update.
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const slots = this._slots;
    if (slots === null || slots.size === 0) return;

    this._notifying++;
    try {
      // Optimization: 1. Inline slots: Manual unroll for hot-path performance.
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

      // Optimization: 2. Overflow scan: Standard loop for performance.
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
   * Determines if the node is dirty by checking its dependency chain.
   * Optimized with O(1) hot-path check.
   */
  protected _isDirty(): boolean {
    const deps = this._deps;
    if (deps === null || deps.size === 0) return false;

    // Optimization: Phase 1: Hot-path Check - O(1)
    const hotIndex = this._hotIndex;
    if (hotIndex !== -1) {
      const hotLink = deps.getAt(hotIndex);
      if (hotLink !== null && hotLink.node.version !== hotLink.version) {
        return true;
      }
    }

    // Phase 2: Standard Validation - O(N)
    return this._deepDirtyCheck();
  }

  /**
   * Deeply validates dependency versions.
   */
  protected abstract _deepDirtyCheck(): boolean;
}
