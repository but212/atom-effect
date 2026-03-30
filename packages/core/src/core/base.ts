import { COMPUTED_STATE_FLAGS, EPOCH_CONSTANTS, IS_DEV, SMI_MAX } from '@/constants';
import { Subscription } from '@/core/dep-tracking';
import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { DepSlotBuffer } from '@/internal/dep-slot-buffer';
import { SlotBuffer } from '@/internal/slot-buffer';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';
import { wrapError } from '@/utils/error';

/**
 * Unified base class for all reactive nodes (Atoms, Computeds, Effects).
 *
 * Optimized for V8 Hidden Class Monomorphism by having a single, consistent
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
  _nextEpoch?: number;
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
    this.flags = 0;
    this.version = 0;
    this._lastSeenEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
    this._notifying = 0;
    this._hotIndex = -1;
    this._slots = null;
    this._deps = null;
    this.id = generateId() & SMI_MAX;
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
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const isFn = typeof listener === 'function';
    if (!isFn && (!listener || typeof (listener as Subscriber).execute !== 'function')) {
      throw wrapError(
        new TypeError('Invalid subscriber'),
        AtomError,
        ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
      );
    }

    let slots = this._slots;
    if (!slots) {
      slots = new SlotBuffer<Subscription<T>>();
      this._slots = slots;
    }

    // Duplicate check
    let duplicate = false;
    slots.forEach((sub) => {
      if (isFn ? sub.fn === listener : sub.sub === listener) {
        duplicate = true;
      }
    });

    if (duplicate) {
      if (IS_DEV) console.warn(`[atom-effect] Duplicate subscription ignored on node ${this.id}`);
      return () => {};
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
    if (!slots) return;

    slots.remove(link);
    if (this._notifying === 0) {
      slots.compact();
    }
  }

  /**
   * Returns current subscriber count.
   */
  subscriberCount(): number {
    return this._slots?.size ?? 0;
  }

  /**
   * Notifies all subscribers about a value update.
   */
  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    const slots = this._slots;
    if (!slots || slots.size === 0) return;

    this._notifying++;
    try {
      slots.forEach((s) => {
        try {
          s.notify(newValue, oldValue);
        } catch (err) {
          console.error(
            wrapError(err, AtomError, ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED)
          );
        }
      });
    } finally {
      this._notifying--;
      if (this._notifying === 0) {
        slots.compact();
      }
    }
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
    if (!deps || deps.size === 0) return false;

    // Phase 1: Hot-path Check - O(1)
    if (this._hotIndex !== -1) {
      const hotLink = deps.getAt(this._hotIndex);
      if (hotLink != null && hotLink.node.version !== hotLink.version) {
        return true;
      }
    }

    // Phase 2: Standard Validation - O(N)
    if (!deps.hasComputeds && !deps.isDirtyFast()) return false;

    // Deep check for computeds
    return this._deepDirtyCheck();
  }

  /**
   * Deeply validates dependency versions.
   */
  protected abstract _deepDirtyCheck(): boolean;
}
