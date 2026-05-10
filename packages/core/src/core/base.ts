/**
 * Core Reactive Engine
 *
 * Responsibility:
 * - Orchestrates internal tracking, scheduling, and subscription propagation.
 * - Manages the global tracking stack for nested reactive contexts.
 *
 * Design Goals:
 * - Glitch-free propagation via unified epoch-based scheduling.
 * - V8 SMI (Small Integer) and Hidden Class optimizations for peak performance.
 * - Atomic updates through batched notification cycles.
 *
 * Boundaries:
 * - Agnostic to node implementations (Atoms, Computeds, effects).
 * - All reactive access within this module must be synchronous.
 */

import { SlotBuffer } from '@but212/atom-effect-utils';
import { COMPUTED_STATE_FLAGS, IS_DEV, KIND, LOG_PREFIX } from '@/constants';
import type {
  Dependency,
  DependencyLink,
  DependencySubscriber,
  DependencyTracker,
  InternalNode,
  Prettify,
  ReactiveNode,
  Subscriber,
  SubscriberKind,
  SubscriberTarget,
  Subscription,
  TrackingContext,
} from '@/types';
import { AtomError, type AtomErrorConstructor, ERROR_MESSAGES, wrapError } from '@/utils';
import {
  claimExisting,
  depBufferTruncateFrom,
  insertNew,
  isBufferDirty,
  isBufferShallowDirty,
} from './buffers';

import { nextEpoch, nextSmi } from './scheduler';

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
  const stack = context.stack;
  stack.pop();
  const len = stack.length;
  context.current = len > 0 ? stack[len - 1]! : null;
}

/**
 * Resets the tracking stack to a specific depth.
 *
 * Why: Prevents dependency leakage during error recovery if a
 * computation fails mid-execution.
 * @internal
 */
export function rollbackTrackingSubscriber(context: TrackingContext, depth: number): void {
  const stack = context.stack;
  stack.length = depth;
  context.current = depth > 0 ? stack[depth - 1]! : null;
}

/**
 * Executes a function within the scope of a specific subscriber.
 * @internal
 */
export function runInTrackingContext<T>(
  context: TrackingContext,
  subscriber: DependencySubscriber,
  fn: () => T
): T {
  // Optimization: Skip stack operations if already in the same context.
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

/** @internal */
export function createTrackingContextObject(): TrackingContext {
  return createTrackingContext();
}

/** @internal */
export const trackingContext = createTrackingContext();

/**
 * Dispatch table for subscriber notification strategies.
 * Avoids branch logic in hot loops.
 * @internal
 */
const NOTIFIER_STRATEGY: Record<
  SubscriberKind,
  (sub: Subscription<unknown>, newValue?: unknown, oldValue?: unknown) => void
> = {
  [KIND.Fn]: (sub, n, o) => (sub.t as (n?: unknown, o?: unknown) => void)(n, o),
  [KIND.Obj]: (sub) => (sub.t as Subscriber).execute(),
};

/**
 * Executes a scope where reactive dependencies are ignored.
 *
 * When to use:
 * - Accessing atoms without creating a subscription.
 * - Side-effects (logging) that shouldn't trigger re-runs.
 * - Breaking circular dependencies by reading "silently".
 *
 * Example:
 * ```ts
 * effect(() => {
 *   const val = count.value; // Tracked
 *   untracked(() => console.log(count.value)); // Not tracked
 * });
 * ```
 */
export function untracked<T>(fn: () => T): T {
  if (trackingContext.current === null) return fn();

  pushTrackingSubscriber(trackingContext, null);
  try {
    return fn();
  } finally {
    popTrackingSubscriber(trackingContext);
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
 * Shared logic for registering a dependency during a reactive session.
 *
 * Optimization: Uses `_lastSeenEpoch` for O(1) session-level deduplication,
 * avoiding expensive buffer lookups for already visited nodes.
 * @internal
 */
export function nodeTrackDependency<T>(
  tracker: DependencyTracker & ReactiveNode<T>,
  dep: Dependency,
  notifyCallback: () => void
): void {
  const internal = tracker as unknown as InternalNode;
  const trackEpoch = internal._trackEpoch;

  // Logic: Session-level Deduplication
  // Avoids buffer lookup if the dependency was already seen in the current epoch.
  if (dep._lastSeenEpoch === trackEpoch) return;
  dep._lastSeenEpoch = trackEpoch;

  const trackIndex = internal._trackCount++;
  const deps = tracker._storage.deps!;

  if (!claimExisting(deps, dep, trackIndex)) {
    const unsubscribe = dep.subscribe(notifyCallback);
    insertNew(deps, trackIndex, { node: dep, version: dep.version, unsub: unsubscribe });
  }

  if (dep.isComputed) {
    deps.hasComputeds = true;
  }
}

/** @internal */
export function createSubscription<T, K extends SubscriberKind>(
  k: K,
  t: K extends typeof KIND.Fn ? (newValue?: T, oldValue?: T) => void : Subscriber
): Subscription<T> {
  return { k, t } as Subscription<T>;
}

/**
 * Generates the next version number for stateful objects.
 * Uses SMI-safe increments to prevent de-optimization.
 */
export function nextVersion(v: number): number {
  return nextSmi(v);
}

/**
 * Registers a subscriber to a reactive node.
 *
 * Performance: Uses a SlotBuffer to allow O(1) removal of listeners
 * during batch notifications.
 * @internal
 */
export function nodeSubscribe<T>(node: ReactiveNode<T>, listener: SubscriberTarget<T>): () => void {
  let link: Subscription<T> | undefined;

  if (typeof listener === 'function') {
    link = createSubscription(KIND.Fn, listener);
  } else if (listener != null && typeof (listener as Subscriber).execute === 'function') {
    link = createSubscription(KIND.Obj, listener);
  }

  if (!link)
    throw wrapError(
      new TypeError('Invalid subscriber'),
      AtomError,
      ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
    );

  let slots = node._storage.slots;
  if (slots === null) {
    node._storage.slots = slots = new SlotBuffer<Subscription<T>>();
  } else if (nodeHasSubscription(node, listener)) {
    if (IS_DEV) console.warn(`${LOG_PREFIX} Duplicate subscription ignored on node ${node.id}`);
    return () => {}; // Deduplication
  }

  slots.push(link);
  return () => nodeUnsubscribe(node, link as Subscription<T>);
}

/** @internal */
export function nodeUnsubscribe<T>(node: ReactiveNode<T>, link: Subscription<T>): void {
  const slots = node._storage.slots;
  if (slots === null) return;

  slots.remove(link);
  slots.compact();
}

/**
 * Notifies all subscribers of a node change.
 *
 * Safety:
 * - Locks the SlotBuffer to prevent index shifts if a subscriber unsubscribes itself during execution.
 * - Suppresses tracking during notification to prevent accidental dependency capture.
 * @internal
 */
export function nodeNotifySubscribers<T>(
  node: ReactiveNode<T>,
  newValue: T | undefined,
  oldValue: T | undefined
): void {
  const slots = node._storage.slots;
  if (slots === null || slots.size === 0) return;

  const ctx = trackingContext;
  const prevCurrent = ctx.current;
  const isTracking = prevCurrent !== null;

  // Reason: Suppress tracking during subscriber execution to prevent "reactive loops"
  // or accidental dependencies if a subscriber reads another reactive node.
  if (isTracking) {
    ctx.stack.push(null);
    ctx.current = null;
  }

  slots.lock();
  try {
    const len = slots.length;
    for (let i = 0; i < len; i++) {
      const sub = slots.at(i);
      if (sub !== null) {
        try {
          NOTIFIER_STRATEGY[sub.k](sub as Subscription<unknown>, newValue, oldValue);
        } catch (e) {
          console.error(`${LOG_PREFIX} Subscriber failed:`, e);
        }
      }
    }
  } finally {
    if (isTracking) {
      ctx.stack.pop();
      ctx.current = prevCurrent;
    }
    slots.unlock();
  }
}

/**
 * Checks for duplicate listeners.
 * @internal
 */
export function nodeHasSubscription<T>(node: ReactiveNode<T>, listener: unknown): boolean {
  const slots = node._storage.slots;
  if (slots === null || slots.size === 0) return false;

  const len = slots.length;
  for (let i = 0; i < len; i++) {
    const sub = slots.at(i);
    if (sub != null && sub.t === listener) {
      return true;
    }
  }
  return false;
}

/**
 * Logic: Tracking Orchestrator - Start
 * Prepares a node for a new tracking session by initializing the epoch and resetting counters.
 * @internal
 */
export function nodeStartTracking<T>(node: Prettify<DependencyTracker & ReactiveNode<T>>): number {
  const epoch = nextEpoch();
  const internal = node as unknown as InternalNode;
  internal._trackEpoch = epoch;
  internal._trackCount = 0;
  return epoch;
}

/**
 * Logic: Tracking Orchestrator - Commit
 * Finalizes the tracking session by truncating unused dependencies.
 * @internal
 */
export function nodeCommitDeps<T>(node: DependencyTracker & ReactiveNode<T>): void {
  const internal = node as unknown as InternalNode;
  const deps = node._storage.deps;
  if (deps) {
    try {
      depBufferTruncateFrom(deps, internal._trackCount);
    } catch (e) {
      if (IS_DEV) {
        console.warn(`${LOG_PREFIX} nodeCommitDeps failed for node ${node.id}:`, e);
      }
    }
  }
}

/**
 * Logic: Reactive Error Boundary
 *
 * Why: Computeds increment their version on error to signal a state change
 * even if a valid value was not produced.
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
    const internal = node as unknown as InternalNode;
    if (!internal.isRejected || internal._error !== wrappedError) {
      node.version = nextVersion(node.version);
    }
    internal._error = wrappedError;
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

export function nodeIsDisposed<T>(node: ReactiveNode<T>): boolean {
  return (node.flags & COMPUTED_STATE_FLAGS.DISPOSED) !== 0;
}

export function nodeIsComputed<T>(node: ReactiveNode<T>): boolean {
  return (node.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0;
}

export function nodeIsNotifying<T>(node: ReactiveNode<T>): boolean {
  return node._storage.slots?.isLocked ?? false;
}

export function nodeSubscriberCount<T>(node: ReactiveNode<T>): number {
  return node._storage.slots?.size ?? 0;
}

export function nodeIsDirty<T>(node: ReactiveNode<T>): boolean {
  const deps = node._storage.deps;
  return deps !== null && isBufferDirty(deps);
}

export function nodeIsShallowDirty<T>(node: ReactiveNode<T>): boolean {
  const deps = node._storage.deps;
  return deps !== null && isBufferShallowDirty(deps);
}
