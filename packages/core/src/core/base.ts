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
import { EPOCH_CONSTANTS, ERROR_MESSAGES, IS_DEV, KIND, LOG_PREFIX, SMI_MAX } from '@/constants';
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
  Subscriber,
  SubscriberTarget,
  TrackingContext,
} from '@/types';
import { AtomError, generateId, nextSmi, wrapError } from '@/utils';

import { BUFFER_FLAGS, claimExisting, depBufferTruncateFrom, insertNew } from './buffers';

import { nextEpoch } from './scheduler';

/** @internal */
export abstract class BaseNode<T = unknown> implements ReactiveNodeBase {
  flags: number;
  version: number = 0;
  _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  _k: typeof KIND.Obj = KIND.Obj;
  readonly id: DependencyId = generateId() & SMI_MAX;
  _slots: SlotBuffer<SubscriberTarget<T>> | null = null;

  constructor(initialFlags: number = 0) {
    this.flags = initialFlags;
  }

  get isDisposed(): boolean {
    return (this.flags & 1) !== 0;
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
    const unsub = Result.unwrap(nodeSubscribe(this, listener));
    if (this.isDisposed) {
      unsub();
      return () => {};
    }
    return unsub;
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
  restoreTrackingDepth(context, context.stack.length - 1);
}

/**
 * Logic: Tracking Recovery
 * @internal
 */
export function rollbackTrackingSubscriber(context: TrackingContext, depth: number): void {
  restoreTrackingDepth(context, depth);
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
export function restoreTrackingDepth(context: TrackingContext, depth: number): void {
  const stack = context.stack;
  const nextDepth = Math.max(0, Math.min(depth, stack.length));
  stack.length = nextDepth;
  context.current = stack[nextDepth - 1] ?? null;
}

/** @internal */
export function resetTrackingContext(context: TrackingContext): void {
  restoreTrackingDepth(context, 0);
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
  unsub: (() => void) | undefined = undefined
): DependencyLink {
  return { node, version, unsub };
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
  dep: Dependency,
  notifyCallback: (() => void) | Subscriber
): void {
  if (!tracker._depSlots) return;

  const trackEpoch = tracker._trackEpoch;

  if (dep._lastSeenEpoch === trackEpoch) return;
  dep._lastSeenEpoch = trackEpoch;

  const trackIndex = tracker._trackCount++;

  // Logic: Subscription Reconciliation
  // Attempts to reuse an existing subscription from a previous run to minimize
  // listener attachment overhead.
  if (!claimExisting(tracker, dep, trackIndex)) {
    const unsubscribe = dep.subscribe(notifyCallback);
    insertNew(tracker, trackIndex, { node: dep, version: dep.version, unsub: unsubscribe });
  }

  if (!(tracker._depFlags & BUFFER_FLAGS.HAS_COMPUTEDS) && dep.isComputed) {
    tracker._depFlags |= BUFFER_FLAGS.HAS_COMPUTEDS;
  }
}

/**
 * Logic: SMI-safe increment to prevent V8 hidden class de-optimization.
 * @internal
 */
export function nextVersion(v: number): number {
  return nextSmi(v);
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
  if (!isSubscriberTarget(listener)) {
    return Result.err(
      wrapError(
        new TypeError('Invalid subscriber'),
        AtomError,
        ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
      )
    );
  }

  node._slots ??= new SlotBuffer<SubscriberTarget<T>>();
  const slots = node._slots;

  if (nodeHasSubscription(node, listener)) {
    if (IS_DEV) console.warn(`${LOG_PREFIX} Duplicate subscription ignored on node ${node.id}`);
    return Result.ok(() => {});
  }

  slots.push(listener);
  let n: ReactiveNode<T> | undefined = node;
  let l: SubscriberTarget<T> | undefined = listener;
  return Result.ok(() => {
    if (n && l) {
      nodeUnsubscribe(n, l);
      n = undefined;
      l = undefined;
    }
  });
}

/** @internal */
export function isSubscriberTarget(listener: unknown): listener is SubscriberTarget<unknown> {
  return (
    typeof listener === 'function' ||
    (listener != null && typeof (listener as Subscriber).execute === 'function')
  );
}

/** @internal */
export function nodeUnsubscribe<T>(node: ReactiveNode<T>, listener: SubscriberTarget<T>): void {
  const slots = node._slots;
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
  const slots = node._slots;
  if (slots == null || slots.size === 0) return;

  const ctx = trackingContext;
  const prevCurrent = ctx.current;
  const isTracking = prevCurrent !== null;

  if (isTracking) {
    pushTrackingSubscriber(ctx, null);
  }

  slots.lock();
  try {
    const len = slots.length;

    for (let i = 0; i < len; i++) {
      const sub = slots.at(i);
      if (sub) {
        try {
          if (typeof sub === 'function') {
            (sub as (n?: unknown, o?: unknown) => void)(newValue, oldValue);
          } else {
            (sub as Subscriber).execute();
          }
        } catch (e) {
          console.error(`${LOG_PREFIX} Subscriber failed on node ${node.id}:`, e);
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
  const slots = node._slots;
  if (slots == null || slots.size === 0) return false;

  const len = slots.length;
  for (let i = 0; i < len; i++) {
    const sub = slots.at(i);
    if (sub != null && sub === listener) {
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
  } catch (e) {
    if (IS_DEV) {
      console.warn(`${LOG_PREFIX} nodeCommitDeps failed for node ${node.id}:`, e);
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
export function nodeHandleError<T, E extends Error>(
  node: ReactiveNode<T> & { isComputed?: boolean; isRejected?: boolean; version: number },
  error: unknown,
  ErrorClass: AtomErrorConstructor,
  message: string,
  onError?: ((error: E) => void) | null
): void {
  const wrappedError = wrapError(error, ErrorClass, message) as unknown as E;

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
    } catch (e) {
      console.error(ERROR_MESSAGES.CALLBACK_ERROR_IN_ERROR_HANDLER, e);
    }
  }

  nodeNotifySubscribers(node, undefined, undefined);
}

/** @internal - Returns active listener count. */
export function nodeSubscriberCount<T>(node: ReactiveNode<T>): number {
  return node._slots?.size ?? 0;
}
