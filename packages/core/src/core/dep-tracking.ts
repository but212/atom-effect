import type { DependencySubscriber, Listener } from '@/tracking/tracking.types';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';
/**
 * Tracks dependency.
 */
export function trackDependency<T>(
  dependency: Dependency,
  current: Listener,
  subscribers: Subscription<T>[]
): void {
  if (typeof current === 'function') {
    const fn = current as (newValue?: T, oldValue?: T) => void;
    // O(n) duplicate check — acceptable because:
    // 1. subscribers array is typically 1-10 elements
    // 2. DependencySubscriber (hot path) uses O(1) epoch-based dedup via addDependency
    // 3. This branch only runs for raw function listeners (uncommon)
    if (subscribers.some((link) => link && link.fn === fn)) return;
    subscribers.push(new Subscription(fn, undefined));
    return;
  }

  if ('addDependency' in (current as object)) {
    (current as DependencySubscriber).addDependency(dependency);
    return;
  }

  const sub = current as Subscriber;
  if (subscribers.some((link) => link && link.sub === sub)) return;
  subscribers.push(new Subscription(undefined, sub));
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
  prevLinks.forEach((link) => {
    if (link?.unsub) {
      parked.set(link.node, link.unsub);
    }
  });

  // Reclaim or subscribe
  nextLinks.forEach((link) => {
    if (!link) return;

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
  });

  // Cleanup: release unused subscriptions
  parked.forEach((unsub) => unsub());
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
 * Subscription entry.
 */
export class Subscription<T> {
  public fn: ((newValue?: T, oldValue?: T) => void) | undefined;
  public sub: Subscriber | undefined;

  constructor(fn: ((newValue?: T, oldValue?: T) => void) | undefined, sub: Subscriber | undefined) {
    // Always initialize both properties to maintain consistent V8 hidden class
    this.fn = fn;
    this.sub = sub;
  }
}
