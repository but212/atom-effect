import { NODE_FLAGS } from '@/constants';
import type { DependencySubscriber } from '@/tracking/tracking.types';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Tracks a dependency for the current reactive context.
 */
export function trackDependency<T>(
  dependency: Dependency,
  current: unknown,
  subscribers: SubscriberLink<T>[]
): void {
  if (current === undefined || current === null) return;

  // 1. DependencySubscriber path (Computed, Effect) - Most common case
  const depSub = current as DependencySubscriber;
  if (typeof depSub.addDependency === 'function') {
    depSub.addDependency(dependency);
    return;
  }

  // 2. Manual function listeners
  if (typeof current === 'function') {
    const fn = current as (newValue?: T, oldValue?: T) => void;
    // Optimization: Hoist length to avoid repeated access
    const len = subscribers.length;
    for (let i = 0; i < len; i++) {
      if (subscribers[i]!.fn === fn) return;
    }
    subscribers.push(new SubscriberLink(fn));
    dependency.flags |= NODE_FLAGS.HAS_FN_SUBS;
    return;
  }

  // 3. Subscriber objects with 'execute' method
  const sub = current as Subscriber;
  if (typeof sub.execute === 'function') {
    const len = subscribers.length;
    for (let i = 0; i < len; i++) {
      if (subscribers[i]!.sub === sub) return;
    }
    subscribers.push(new SubscriberLink(undefined, sub));
    dependency.flags |= NODE_FLAGS.HAS_OBJ_SUBS;
  }
}

/**
 * Synchronizes subscriptions using an O(N) strategy optimized for cache locality.
 * Uses DependencyLink (AOS) to improve data cohesion.
 */
export function syncDependencies(
  nextLinks: DependencyLink[],
  prevLinks: DependencyLink[],
  tracker: Subscriber
): void {
  const prevLen = prevLinks.length;
  const nextLen = nextLinks.length;

  // 1. Mark existing dependencies
  // Optimization: Unrolled simplified loop for setup
  if (prevLen > 0) {
    for (let i = 0; i < prevLen; i++) {
      const link = prevLinks[i];
      if (link) {
        link.node._tempUnsub = link.unsub;
      }
    }
  }

  // 2. Process new dependencies (Sweep/Reuse)
  for (let i = 0; i < nextLen; i++) {
    const link = nextLinks[i];
    if (!link) continue;

    // cache node access
    const node = link.node;
    const existingUnsub = node._tempUnsub;

    if (existingUnsub !== undefined) {
      link.unsub = existingUnsub;
      node._tempUnsub = undefined;
    } else {
      // New dependency found
      debug.checkCircular(node, tracker);
      link.unsub = node.subscribe(tracker);
    }
  }

  // 3. Cleanup removed dependencies
  if (prevLen > 0) {
    for (let i = 0; i < prevLen; i++) {
      const link = prevLinks[i];
      if (link) {
        // optimization: use cached node ref if possible, but here we access link.node
        const node = link.node;
        const remainingUnsub = node._tempUnsub;
        if (remainingUnsub !== undefined) {
          remainingUnsub();
          node._tempUnsub = undefined;
        }
        // Link objects should be ideally cleaned up or returned to a pool
        link.unsub = undefined;
      }
    }
  }
}

/**
 * Encapsulates a link to a dependency with its version and subscription.
 * Part of the AOS (Array of Structs) refactoring to improve data cohesion.
 */
export class DependencyLink {
  /** The dependency node being tracked */
  node: Dependency;
  /** The version of the dependency at the time of tracking */
  version: number;
  /** The unsubscription function for the dependency */
  unsub: (() => void) | undefined;

  constructor(node: Dependency, version: number, unsub: (() => void) | undefined = undefined) {
    this.node = node;
    this.version = version;
    this.unsub = unsub;
  }
}

/**
 * Encapsulates a link to a subscriber (either function or object).
 * Part of the AOS refactoring to unify subscriber management.
 */
export class SubscriberLink<T> {
  /** Function listener (if any) */
  fn: ((newValue?: T, oldValue?: T) => void) | undefined;
  /** Subscriber object (if any) */
  sub: Subscriber | undefined;

  constructor(
    fn?: ((newValue?: T, oldValue?: T) => void) | undefined,
    sub?: Subscriber | undefined
  ) {
    this.fn = fn;
    this.sub = sub;
  }
}
