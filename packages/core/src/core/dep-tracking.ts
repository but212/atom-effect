import type { DependencySubscriber, Listener } from '@/tracking/tracking.types';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';
/**
 * Tracks dependency.
 */
export function trackDependency<T>(
  dependency: Dependency,
  current: Listener,
  subscribers: SubscriberLink<T>[]
): void {
  if (typeof current === 'function') {
    const fn = current as (newValue?: T, oldValue?: T) => void;
    // O(n) duplicate check — acceptable because:
    // 1. subscribers array is typically 1-10 elements
    // 2. DependencySubscriber (hot path) uses O(1) epoch-based dedup via addDependency
    // 3. This branch only runs for raw function listeners (uncommon)
    for (let i = 0, len = subscribers.length; i < len; i++) {
      const link = subscribers[i];
      if (link && link.fn === fn) return;
    }
    subscribers.push(new SubscriberLink(fn, undefined));
    return;
  }

  if ('addDependency' in (current as object)) {
    (current as DependencySubscriber).addDependency(dependency);
    return;
  }

  const sub = current as Subscriber;
  for (let i = 0, len = subscribers.length; i < len; i++) {
    const link = subscribers[i];
    if (link && link.sub === sub) return;
  }
  subscribers.push(new SubscriberLink(undefined, sub));
}

/**
 * Syncs dependencies.
 * Uses a local Map to park previous subscriptions, avoiding
 * temporary state on dependency nodes.
 */
export function syncDependencies(
  nextLinks: DependencyLink[],
  prevLinks: DependencyLink[],
  tracker: Subscriber
): void {
  // Park: collect previous subscriptions into a local Map
  const parked = new Map<Dependency, () => void>();
  for (let i = 0, len = prevLinks.length; i < len; i++) {
    const link = prevLinks[i];
    if (link?.unsub) {
      parked.set(link.node, link.unsub);
    }
  }

  // Reclaim or subscribe
  for (let i = 0, len = nextLinks.length; i < len; i++) {
    const link = nextLinks[i];
    if (!link) continue;

    const node = link.node;
    const existing = parked.get(node);
    if (existing !== undefined) {
      // Re-link: reclaim subscription from previous set
      link.unsub = existing;
      parked.delete(node);
    } else {
      // New link: subscribe afresh
      debug.checkCircular(node, tracker);
      link.unsub = node.subscribe(tracker);
    }
  }

  // Cleanup: release unused subscriptions
  for (const unsub of parked.values()) {
    unsub();
  }
}

/**
 * Dependency graph edge.
 */
export class DependencyLink {
  public unsub: (() => void) | undefined;

  constructor(
    public node: Dependency,
    public version: number,
    unsub: (() => void) | undefined = undefined
  ) {
    // Always initialize to maintain consistent V8 hidden class
    this.unsub = unsub;
  }
}

/**
 * Subscriber link.
 */
export class SubscriberLink<T> {
  public fn: ((newValue?: T, oldValue?: T) => void) | undefined;
  public sub: Subscriber | undefined;

  constructor(fn: ((newValue?: T, oldValue?: T) => void) | undefined, sub: Subscriber | undefined) {
    // Always initialize both properties to maintain consistent V8 hidden class
    this.fn = fn;
    this.sub = sub;
  }
}
