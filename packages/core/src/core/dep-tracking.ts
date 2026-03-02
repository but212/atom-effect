import type { Dependency, Subscriber } from '@/types';
// trackDependency removed as it was obsolete and caused polymorphic cache misses
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
  for (let i = 0; i < prevLinks.length; i++) {
    const link = prevLinks[i];
    if (link?.unsub) {
      parked.set(link.node, link.unsub);
    }
  }

  // Reclaim or subscribe
  for (let i = 0; i < nextLinks.length; i++) {
    const nextLink = nextLinks[i];
    if (!nextLink) continue;

    const node = nextLink.node;
    const existingUnsub = parked.get(node);

    if (existingUnsub !== undefined) {
      // Re-link: reclaim subscription from previous set
      nextLink.unsub = existingUnsub;
      parked.delete(node);
    } else {
      // New link: subscribe afresh
      // Protect against double-subscription if unsub is somehow already set
      if (!nextLink.unsub) {
        nextLink.unsub = node.subscribe(tracker);
      }
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

  notify(newValue?: T, oldValue?: T): void {
    if (this.fn) this.fn(newValue, oldValue);
    else if (this.sub) this.sub.execute();
  }
}
