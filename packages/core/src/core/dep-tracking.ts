import { NODE_FLAGS } from '@/constants';
import type { DependencySubscriber, Listener } from '@/tracking/tracking.types';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Tracks a dependency for the current reactive context.
 */
export function trackDependency<T>(
  dependency: Dependency,
  current: Listener,
  subscribers: SubscriberLink<T>[]
): void {
  const tracker = current as Partial<DependencySubscriber>;
  if (typeof tracker.addDependency === 'function') {
    tracker.addDependency(dependency);
    return;
  }

  if (typeof current === 'function') {
    const fn = current as (newValue?: T, oldValue?: T) => void;
    for (let i = 0, len = subscribers.length; i < len; i++) {
      if (subscribers[i]!.fn === fn) return;
    }
    subscribers.push(new SubscriberLink(fn));
    dependency.flags |= NODE_FLAGS.HAS_FN_SUBS;
    return;
  }

  if ('execute' in current && typeof current.execute === 'function') {
    const sub = current as Subscriber;
    for (let i = 0, len = subscribers.length; i < len; i++) {
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
  for (let i = 0, len = prevLinks.length; i < len; i++) {
    const link = prevLinks[i];
    if (link) link.node._tempUnsub = link.unsub;
  }
  for (let i = 0, len = nextLinks.length; i < len; i++) {
    const link = nextLinks[i];
    if (!link) continue;
    const node = link.node;
    if (node._tempUnsub !== undefined) {
      link.unsub = node._tempUnsub;
      node._tempUnsub = undefined;
    } else {
      debug.checkCircular(node, tracker);
      link.unsub = node.subscribe(tracker);
    }
  }

  for (let i = 0, len = prevLinks.length; i < len; i++) {
    const link = prevLinks[i];
    if (link) {
      const node = link.node;
      if (node._tempUnsub !== undefined) {
        node._tempUnsub();
        node._tempUnsub = undefined;
      }
      link.unsub = undefined;
    }
  }
}

/**
 * Encapsulates a link to a dependency with its version and subscription.
 */
export class DependencyLink {
  constructor(
    public node: Dependency,
    public version: number,
    public unsub: (() => void) | undefined = undefined
  ) {}
}

/**
 * Encapsulates a link to a subscriber.
 * Why: Flat object structure optimized for memory usage (V8 hidden classes).
 */
export class SubscriberLink<T> {
  constructor(
    public fn: ((newValue?: T, oldValue?: T) => void) | undefined = undefined,
    public sub: Subscriber | undefined = undefined
  ) {}
}
