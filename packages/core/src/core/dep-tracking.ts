import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';
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
  // Reclaim or subscribe
  for (let i = 0; i < nextLinks.length; i++) {
    const nextLink = nextLinks[i];
    if (!nextLink) continue;

    const node = nextLink.node;
    let reclaimed = false;

    // Linear scan for previous link (Zero-allocation Map)
    for (let j = 0; j < prevLinks.length; j++) {
      const prevLink = prevLinks[j];
      if (prevLink && prevLink.node === node && prevLink.unsub) {
        nextLink.unsub = prevLink.unsub;
        prevLinks[j] = null!; // Mark as reclaimed
        reclaimed = true;
        break;
      }
    }

    if (!reclaimed) {
      // New link: subscribe afresh
      debug.checkCircular(node, tracker);
      nextLink.unsub = node.subscribe(tracker);
    }
  }

  // Cleanup: release unused subscriptions
  for (let j = 0; j < prevLinks.length; j++) {
    const prevLink = prevLinks[j];
    if (prevLink?.unsub) {
      prevLink.unsub();
    }
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
