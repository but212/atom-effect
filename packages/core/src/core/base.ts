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
import { COMPUTED_STATE_FLAGS, ERROR_MESSAGES, IS_DEV, KIND, LOG_PREFIX } from '@/constants';
import type {
  AtomErrorConstructor,
  Dependency,
  DependencyLink,
  DependencySubscriber,
  DependencyTracker,
  Prettify,
  ReactiveNode,
  Subscriber,
  SubscriberKind,
  SubscriberTarget,
  Subscription,
  TrackingContext,
} from '@/types';
import { AtomError, nextSmi, wrapError } from '@/utils';

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
 * Logic: Tracking Recovery
 * @internal
 */
export function rollbackTrackingSubscriber(context: TrackingContext, depth: number): void {
  const stack = context.stack;
  stack.length = depth;
  context.current = depth > 0 ? stack[depth - 1]! : null;
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

/** @internal */
export function createTrackingContextObject(): TrackingContext {
  return createTrackingContext();
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
export function nodeTrackDependency<T>(
  tracker: DependencyTracker & ReactiveNode<T>,
  dep: Dependency,
  notifyCallback: () => void
): void {
  const trackEpoch = tracker._trackEpoch;

  if (dep._lastSeenEpoch === trackEpoch) return;
  dep._lastSeenEpoch = trackEpoch;

  const trackIndex = tracker._trackCount;
  tracker._trackCount = trackIndex + 1;
  const deps = tracker._storage.deps!;

  // Logic: Subscription Reconciliation
  // Attempts to reuse an existing subscription from a previous run to minimize
  // listener attachment overhead.
  if (!claimExisting(deps, dep, trackIndex)) {
    const unsubscribe = dep.subscribe(notifyCallback);
    insertNew(deps, trackIndex, { node: dep, version: dep.version, unsub: unsubscribe });
  }

  if (!(deps.flags & BUFFER_FLAGS.HAS_COMPUTEDS) && dep.isComputed) {
    deps.flags |= BUFFER_FLAGS.HAS_COMPUTEDS;
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
  let link: Subscription<T> | undefined;

  if (typeof listener === 'function') {
    link = createSubscription(KIND.Fn, listener);
  } else if (listener != null && typeof (listener as Subscriber).execute === 'function') {
    link = createSubscription(KIND.Obj, listener);
  }

  if (!link) {
    return Result.err(
      wrapError(
        new TypeError('Invalid subscriber'),
        AtomError,
        ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION
      )
    );
  }

  node._storage.slots ??= new SlotBuffer<Subscription<T>>();
  const slots = node._storage.slots;

  if (nodeHasSubscription(node, listener)) {
    if (IS_DEV) console.warn(`${LOG_PREFIX} Duplicate subscription ignored on node ${node.id}`);
    return Result.ok(() => {});
  }

  slots.push(link);
  let n: ReactiveNode<T> | undefined = node;
  return Result.ok(() => {
    if (n && link) {
      nodeUnsubscribe(n, link);
      n = undefined;
      link = undefined;
    }
  });
}

/** @internal */
export function nodeUnsubscribe<T>(node: ReactiveNode<T>, link: Subscription<T>): void {
  const slots = node._storage.slots;
  if (slots === null) return;

  if (slots.remove(link)) {
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
  const slots = node._storage.slots;
  if (slots === null || slots.size === 0) return;

  const ctx = trackingContext;
  const prevCurrent = ctx.current;
  const isTracking = prevCurrent !== null;

  if (isTracking) {
    pushTrackingSubscriber(ctx, null);
  }

  slots.lock();
  try {
    const len = slots.length;
    const fnKind = KIND.Fn;

    for (let i = 0; i < len; i++) {
      const sub = slots.at(i);
      if (sub === null) continue;

      try {
        if (sub.k === fnKind) {
          (sub.t as (n?: unknown, o?: unknown) => void)(newValue, oldValue);
        } else {
          (sub.t as Subscriber).execute();
        }
      } catch (e) {
        console.error(`${LOG_PREFIX} Subscriber failed on node ${node.id}:`, e);
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

/** @internal - Advanced tracking epoch for a new session. */
export function nodeStartTracking<T>(node: Prettify<DependencyTracker & ReactiveNode<T>>): number {
  const epoch = nextEpoch();
  node._trackEpoch = epoch;
  node._trackCount = 0;
  return epoch;
}

/** @internal - Finalizes dependencies by truncating unused buffer slots. */
export function nodeCommitDeps<T>(node: DependencyTracker & ReactiveNode<T>): void {
  const deps = node._storage.deps;
  if (deps) {
    try {
      depBufferTruncateFrom(deps, node._trackCount);
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

/** @internal - Checks computed flag. */
export function nodeIsComputed<T>(node: ReactiveNode<T>): boolean {
  return (node.flags & COMPUTED_STATE_FLAGS.IS_COMPUTED) !== 0;
}

/** @internal - Checks if the slot buffer is locked during notification. */
export function nodeIsNotifying<T>(node: ReactiveNode<T>): boolean {
  return node._storage.slots?.isLocked ?? false;
}

/** @internal - Returns active listener count. */
export function nodeSubscriberCount<T>(node: ReactiveNode<T>): number {
  return node._storage.slots?.size ?? 0;
}

/** @internal - Deep check for upstream changes. */
export function nodeIsDirty<T>(node: ReactiveNode<T>): boolean {
  const deps = node._storage.deps;
  return deps !== null && isBufferDirty(deps);
}

/** @internal - Shallow check for upstream signals. */
export function nodeIsShallowDirty<T>(node: ReactiveNode<T>): boolean {
  const deps = node._storage.deps;
  return deps !== null && isBufferShallowDirty(deps);
}
