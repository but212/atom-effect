import { EPOCH_CONSTANTS, IS_DEV, SMI_MAX } from '@/constants';
import { Subscription } from '@/core/dep-tracking';
import { SlotBuffer } from '@/internal/slot-buffer';
import { AtomError } from '@/errors/errors';
import { ERROR_MESSAGES } from '@/errors/messages';
import type { DependencyId, Subscriber } from '@/types';
import { generateId } from '@/utils/debug';
import { wrapError } from '@/utils/error';

/**
 * Base class for all reactive nodes.
 */
export class ReactiveNode {
  /** State flags */
  flags = 0;
  /** Version counter */
  version = 0;
  /** Last access epoch */
  _lastSeenEpoch = EPOCH_CONSTANTS.UNINITIALIZED;
  /** Scheduler epoch tag */
  _nextEpoch?: number;
  /** Debug ID */
  readonly id: DependencyId = generateId() & SMI_MAX;
}

/**
 * Reactive dependency base class.
 *
 * Subscribers are stored in a {@link SlotBuffer} — an inline-4-slot
 * container that avoids array allocation for the common case (≤4 subscribers)
 * and spills to an overflow array only when needed.
 */
export abstract class ReactiveDependency<T> extends ReactiveNode {
  protected _slots: SlotBuffer<Subscription<T>> | null = null;
  private _notifying = 0;

  /**
   * Adds subscriber.
   */
  subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void {
    const isFn = typeof listener === 'function';
    // Validate subscriber
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
      if (IS_DEV) console.warn('Duplicate subscription ignored.');
      return () => {};
    }

    const link = new Subscription<T>(
      isFn ? (listener as (newValue?: T, oldValue?: T) => void) : undefined,
      !isFn ? (listener as Subscriber) : undefined
    );

    slots.add(link);

    return () => this._unsubscribe(link);
  }

  private _unsubscribe(link: Subscription<T>): void {
    if (!this._slots) return;

    if (this._notifying > 0) {
      // Tombstone: null the slot, defer compaction
      this._slots.remove(link);
      return;
    }

    // Direct removal + compact
    this._slots.remove(link);
    this._slots.compact();
  }

  subscriberCount(): number {
    return this._slots ? this._slots.size : 0;
  }

  protected _notifySubscribers(newValue: T | undefined, oldValue: T | undefined): void {
    if (!this._slots || this._slots.size === 0) return;

    this._notifying++;
    try {
      this._slots.forEach((s) => {
        try {
          s.notify(newValue, oldValue);
        } catch (err) {
          this._handleNotifyError(err);
        }
      });
    } finally {
      this._notifying--;
      if (this._notifying === 0) {
        this._slots.compact();
      }
    }
  }

  private _handleNotifyError(err: unknown): void {
    console.error(wrapError(err, AtomError, ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED));
  }
}
