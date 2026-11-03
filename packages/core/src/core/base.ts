/**
 * @module BaseEngine
 *
 * Responsibility:
 * Orchestrates the fundamental reactive primitives, including tracking context
 * management, dependency registration, and subscription propagation.
 *
 * Design Intent:
 * Provides the low-level orchestration required for glitch-free propagation
 * and efficient memory management. Decouples node implementation from
 * tracking and notification logic to ensure architectural purity.
 */

import { SlotBuffer } from '@but212/atom-effect-utils';
import { ERROR_MESSAGES, IS_DEV, LOG_PREFIX, STATE_FLAGS } from '@/constants';
import type {
  DependencySubscriber,
  ReactiveNode,
  SubscriberTarget,
  TrackingContext,
} from '@/types';
import { AtomError, wrapError } from '@/utils';

/**
 * Role: Global singleton orchestrating the current reactive tracking state.
 * @internal
 */
export const trackingContext: TrackingContext = { stack: [], current: null };

function pushTrackingSubscriber(subscriber: DependencySubscriber | null): void {
  trackingContext.stack.push(subscriber);
  trackingContext.current = subscriber;
}

function popTrackingSubscriber(): void {
  const trackingSubscriberStack = trackingContext.stack;
  trackingSubscriberStack.pop();
  trackingContext.current =
    trackingSubscriberStack.length > 0
      ? (trackingSubscriberStack[trackingSubscriberStack.length - 1] ?? null)
      : null;
}

/**
 * Logic: Scoped Execution
 * Executes a function within the scope of a specific subscriber.
 * @internal
 */
export function runInTrackingContext<T>(subscriber: DependencySubscriber, callback: () => T): T {
  // Optimization: Skip stack operations if already in the target context.
  if (trackingContext.current === subscriber) return callback();

  pushTrackingSubscriber(subscriber);
  try {
    return callback();
  } finally {
    popTrackingSubscriber();
  }
}

/** @internal */
export function resetTrackingContext(): void {
  trackingContext.stack.length = 0;
  trackingContext.current = null;
}

/**
 * Executes a scope where reactive dependencies are suppressed.
 *
 * When to use:
 * - Accessing atoms without creating an automatic subscription.
 * - Performing side-effects (e.g., logging, DOM analytics) that must not trigger re-runs.
 * - Breaking circular dependencies by performing silent reads.
 *
 * @param callback The non-reactive scope to execute.
 * @returns The value returned by the provided function.
 *
 * @example
 * ```typescript
 * import { untracked, effect, atom } from '@but212/atom-effect';
 *
 * const count = atom(0);
 *
 * effect(() => {
 *   // Re-runs only when 'someOtherAtom' changes, ignoring updates to 'count'
 *   untracked(() => console.log('Current count:', count.value));
 * });
 * ```
 */
export function untracked<T>(callback: () => T): T {
  if (trackingContext.current === null) return callback();

  pushTrackingSubscriber(null);
  try {
    return callback();
  } finally {
    popTrackingSubscriber();
  }
}

/**
 * Logic: Listener Registration
 * Attaches a subscriber to a reactive node, supporting both functional
 * and object-based listeners.
 *
 * Optimization: Slot-based Storage
 * Utilizes a `SlotBuffer` to support O(1) removal of listeners, which is
 * critical during high-frequency batch notification cycles.
 *
 * @internal
 */
export function nodeSubscribe<T>(node: ReactiveNode<T>, listener: SubscriberTarget<T>): () => void {
  const isFunctionListener = typeof listener === 'function';
  const isObjectListener =
    !isFunctionListener && listener != null && typeof listener.execute === 'function';

  if (!isFunctionListener && !isObjectListener) {
    throw wrapError(
      new TypeError('Invalid subscriber'),
      AtomError,
      ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
    );
  }

  if ((node.flags & STATE_FLAGS.DISPOSED) !== 0) {
    return () => {};
  }

  node._subscriberSlots ??= new SlotBuffer<SubscriberTarget<T>>();
  const slots = node._subscriberSlots;

  if (nodeHasSubscription(node, listener)) {
    if (IS_DEV) console.warn(`${LOG_PREFIX} Duplicate subscription ignored on node ${node.id}`);
    return () => {};
  }

  slots.push(listener);
  let targetNode: ReactiveNode<T> | undefined = node;
  let subscriberListener: SubscriberTarget<T> | undefined = listener;
  return () => {
    if (targetNode && subscriberListener) {
      nodeUnsubscribe(targetNode, subscriberListener);
      targetNode = undefined;
      subscriberListener = undefined;
    }
  };
}

/** @internal */
export function nodeUnsubscribe<T>(node: ReactiveNode<T>, listener: SubscriberTarget<T>): void {
  const slots = node._subscriberSlots;
  if (slots == null) return;

  slots.remove(listener);
}

/**
 * Logic: Subscriber Notification
 * Synchronizes the state change across all attached subscribers.
 *
 * Constraint: Phase Integrity
 * 1. Locks the `SlotBuffer` to prevent index shifts if a subscriber unsubscribes itself.
 * 2. Suppresses reactive tracking during execution to prevent accidental
 *    dependency capture or infinite reactive loops.
 *
 * @internal
 */
export function nodeNotifySubscribers<T>(
  node: ReactiveNode<T>,
  newValue: T | undefined,
  oldValue: T | undefined,
  computedOnly = false
): void {
  const slots = node._subscriberSlots;
  if (slots == null || slots.size === 0) return;

  const isTracking = trackingContext.current !== null;

  if (isTracking) {
    pushTrackingSubscriber(null);
  }

  slots.lock();
  try {
    const slotsLength = slots.length;

    for (let i = 0; i < slotsLength; i++) {
      const subscriber = slots.at(i);
      if (
        subscriber &&
        (!computedOnly || (typeof subscriber !== 'function' && subscriber.isComputed))
      ) {
        try {
          if (typeof subscriber === 'function') {
            subscriber(newValue, oldValue);
          } else {
            subscriber.execute();
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} Subscriber failed on node ${node.id}:`, error);
        }
      }
    }
  } finally {
    if (isTracking) {
      popTrackingSubscriber();
    }
    slots.unlock();
  }
}

/** @internal */
export function nodeHasSubscription<T>(node: ReactiveNode<T>, listener: unknown): boolean {
  const slots = node._subscriberSlots;
  if (slots == null || slots.size === 0) return false;

  const slotsLength = slots.length;
  for (let i = 0; i < slotsLength; i++) {
    const subscriber = slots.at(i);
    if (subscriber != null && subscriber === listener) {
      return true;
    }
  }
  return false;
}

/** @internal - Returns active listener count. */
export function nodeGetSubscriberCount<T>(node: ReactiveNode<T>): number {
  return node._subscriberSlots?.size ?? 0;
}
