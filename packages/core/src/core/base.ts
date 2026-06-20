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

import { Result, SlotBuffer } from '@but212/atom-effect-utils';
import {
  COMPUTED_STATE_FLAGS,
  EPOCH_CONSTANTS,
  ERROR_MESSAGES,
  IS_DEV,
  KIND,
  LOG_PREFIX,
  SMI_MAX,
  STATE_FLAGS,
} from '@/constants';
import type {
  AtomErrorConstructor,
  Dependency,
  DependencyId,
  DependencyLink,
  DependencySubscriber,
  DependencyTracker,
  Prettify,
  ReactiveDependencyTracker,
  ReactiveNode,
  ReactiveNodeBase,
  SubscriberTarget,
  TrackingContext,
} from '@/types';
import { AtomError, generateId, nextSmi, wrapError } from '@/utils';

import {
  BUFFER_FLAGS,
  claimExisting,
  depBufferTruncateFrom,
  insertNew,
  isBufferDirty,
  isBufferShallowDirty,
} from './buffers';

import { nextEpoch } from './scheduler';

/** @internal */
export abstract class BaseNode<T = unknown> implements ReactiveNodeBase {
  flags: number;
  version: number = 0;
  _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  _kind: typeof KIND.Obj = KIND.Obj;
  readonly id: DependencyId = generateId() & SMI_MAX;
  _subscriberSlots: SlotBuffer<SubscriberTarget<T>> | null = null;

  constructor(initialFlags: number = 0) {
    this.flags = initialFlags;
  }

  get isDisposed(): boolean {
    return (this.flags & STATE_FLAGS.DISPOSED) !== 0;
  }

  get isComputed(): boolean {
    return false;
  }

  get isRejected(): boolean {
    return false;
  }

  get hasError(): boolean {
    return false;
  }

  subscribe(listener: SubscriberTarget<T>): () => void {
    return Result.unwrap(nodeSubscribe(this, listener));
  }

  subscriberCount(): number {
    return nodeSubscriberCount(this);
  }
}

/** @internal */
export function createTrackingContext(): TrackingContext {
  return { stack: [], current: null };
}

/** @internal */
export function pushTrackingSubscriber(
  context: TrackingContext,
  subscriber: DependencySubscriber | null
): void {
  context.stack.push(subscriber);
  context.current = subscriber;
}

/** @internal */
export function popTrackingSubscriber(context: TrackingContext): void {
  const trackingSubscriberStack = context.stack;
  trackingSubscriberStack.pop();
  context.current =
    trackingSubscriberStack.length > 0
      ? (trackingSubscriberStack[trackingSubscriberStack.length - 1] ?? null)
      : null;
}

/**
 * Logic: Scoped Execution
 * Executes a function within the scope of a specific subscriber.
 * @internal
 */
export function runInTrackingContext<T>(
  context: TrackingContext,
  subscriber: DependencySubscriber,
  fn: () => T
): T {
  // Optimization: Skip stack operations if already in the target context.
  if (context.current === subscriber) return fn();

  pushTrackingSubscriber(context, subscriber);
  try {
    return fn();
  } finally {
    popTrackingSubscriber(context);
  }
}

/** @internal */
export function resetTrackingContext(context: TrackingContext): void {
  context.stack.length = 0;
  context.current = null;
}

/**
 * Role: Global singleton orchestrating the current reactive tracking state.
 * @internal
 */
export const trackingContext = createTrackingContext();

/**
 * Executes a scope where reactive dependencies are suppressed.
 *
 * When to use:
 * - Accessing atoms without creating an automatic subscription.
 * - Performing side-effects (e.g., logging, DOM analytics) that must not trigger re-runs.
 * - Breaking circular dependencies by performing silent reads.
 *
 * @param fn - The non-reactive scope to execute.
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
export function untracked<T>(fn: () => T): T {
  const ctx = trackingContext;
  if (ctx.current === null) return fn();

  pushTrackingSubscriber(ctx, null);
  try {
    return fn();
  } finally {
    popTrackingSubscriber(ctx);
  }
}

/** @internal */
export function createDependencyLink(
  node: Dependency,
  version: number,
  unsubscribeCallback: (() => void) | undefined = undefined
): DependencyLink {
  return { node, version, unsubscribeCallback };
}

/**
 * Logic: Dependency Registration
 * Registers a dependency for the current tracker during a reactive session.
 *
 * Optimization: Session Deduplication
 * Uses session-level versioning via `_lastSeenEpoch` to skip redundant
 * buffer lookups for dependencies already visited in the current tick.
 *
 * @internal
 */
export function nodeTrackDependency(
  tracker: DependencyTracker & ReactiveDependencyTracker,
  dependency: Dependency,
  notifyCallback: () => void
): void {
  if (!tracker._depSlots) return;

  const trackEpoch = tracker._trackEpoch;

  if (dependency._lastSeenEpoch === trackEpoch) return;
  dependency._lastSeenEpoch = trackEpoch;

  const trackIndex = tracker._trackCount++;

  // Logic: Subscription Reconciliation
  // Attempts to reuse an existing subscription from a previous run to minimize
  // listener attachment overhead.
  if (!claimExisting(tracker, dependency, trackIndex)) {
    const unsubscribe = dependency.subscribe(notifyCallback);
    insertNew(tracker, trackIndex, {
      node: dependency,
      version: dependency.version,
      unsubscribeCallback: unsubscribe,
    });
  }

  if (!(tracker._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS) && dependency.isComputed) {
    tracker._depFlags |= BUFFER_FLAGS.HAS_COMPUTEDS;
  }
}

/**
 * Logic: SMI-safe increment to prevent V8 hidden class de-optimization.
 * @internal
 */
export function nextVersion(version: number): number {
  return nextSmi(version);
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
export function nodeSubscribe<T>(
  node: ReactiveNode<T>,
  listener: SubscriberTarget<T>
): Result<() => void, Error> {
  const isFunctionListener = typeof listener === 'function';
  const isObjectListener =
    !isFunctionListener && listener != null && typeof listener.execute === 'function';

  if (!isFunctionListener && !isObjectListener) {
    return Result.err(
      wrapError(
        new TypeError('Invalid subscriber'),
        AtomError,
        ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
      )
    );
  }

  if ((node.flags & STATE_FLAGS.DISPOSED) !== 0) {
    return Result.ok(() => {});
  }

  node._subscriberSlots ??= new SlotBuffer<SubscriberTarget<T>>();
  const slots = node._subscriberSlots;

  if (nodeHasSubscription(node, listener)) {
    if (IS_DEV) console.warn(`${LOG_PREFIX} Duplicate subscription ignored on node ${node.id}`);
    return Result.ok(() => {});
  }

  slots.push(listener);
  let targetNode: ReactiveNode<T> | undefined = node;
  let subscriberListener: SubscriberTarget<T> | undefined = listener;
  return Result.ok(() => {
    if (targetNode && subscriberListener) {
      nodeUnsubscribe(targetNode, subscriberListener);
      targetNode = undefined;
      subscriberListener = undefined;
    }
  });
}

/** @internal */
export function nodeUnsubscribe<T>(node: ReactiveNode<T>, listener: SubscriberTarget<T>): void {
  const slots = node._subscriberSlots;
  if (slots == null) return;

  if (slots.remove(listener)) {
    slots.compact();
  }
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
  oldValue: T | undefined
): void {
  const slots = node._subscriberSlots;
  if (slots == null || slots.size === 0) return;

  const ctx = trackingContext;
  const prevCurrent = ctx.current;
  const isTracking = prevCurrent !== null;

  if (isTracking) {
    pushTrackingSubscriber(ctx, null);
  }

  slots.lock();
  try {
    const slotsLength = slots.length;

    for (let i = 0; i < slotsLength; i++) {
      const subscriber = slots.at(i);
      if (subscriber) {
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
      popTrackingSubscriber(ctx);
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

/** @internal - Advanced tracking epoch for a new session. */
export function nodeStartTracking(
  node: Prettify<DependencyTracker & ReactiveDependencyTracker>
): number {
  const epoch = nextEpoch();
  node._trackEpoch = epoch;
  node._trackCount = 0;
  return epoch;
}

/** @internal - Finalizes dependencies by truncating unused buffer slots. */
export function nodeCommitDeps(node: DependencyTracker & ReactiveDependencyTracker): void {
  try {
    depBufferTruncateFrom(node, node._trackCount);
  } catch (error) {
    if (IS_DEV) {
      console.warn(`${LOG_PREFIX} nodeCommitDeps failed for node ${node.id}:`, error);
    }
  }
}

/**
 * Logic: Reactive Error Boundary
 *
 * Why:
 * Computed nodes increment their version on error to signal a state change
 * even if a valid value was not produced. This ensures downstream nodes
 * can react to the failure state.
 *
 * @internal
 */
export function nodeHandleError<T>(
  node: ReactiveNode<T> & { isComputed?: boolean; isRejected?: boolean; version: number },
  error: unknown,
  errorConstructor: AtomErrorConstructor,
  message: string,
  onError?: ((error: Error) => void) | ((error: unknown) => void) | null
): void {
  const wrappedError = wrapError(error, errorConstructor, message);

  if (node.isComputed) {
    if (!node.isRejected || node._error !== wrappedError) {
      node.version = nextVersion(node.version);
    }
    node._error = wrappedError;
  } else {
    console.error(wrappedError);
  }

  if (onError) {
    try {
      onError(wrappedError);
    } catch (error) {
      console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, error);
    }
  }

  nodeNotifySubscribers(node, undefined, undefined);
}

/** @internal - Checks computed flag. */
export function nodeIsComputed<T>(node: ReactiveNode<T>): boolean {
  return (node.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0;
}

/** @internal - Checks if the slot buffer is locked during notification. */
export function nodeIsNotifying<T>(node: ReactiveNode<T>): boolean {
  return node._subscriberSlots?.isLocked ?? false;
}

/** @internal - Returns active listener count. */
export function nodeSubscriberCount<T>(node: ReactiveNode<T>): number {
  return node._subscriberSlots?.size ?? 0;
}

/** @internal - Deep check for upstream changes. */
export function nodeIsDirty(node: ReactiveDependencyTracker): boolean {
  return isBufferDirty(node);
}

/** @internal - Shallow check for upstream signals. */
export function nodeIsShallowDirty(node: ReactiveDependencyTracker): boolean {
  return isBufferShallowDirty(node);
}
