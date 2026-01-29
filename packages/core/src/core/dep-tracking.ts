import { NODE_FLAGS } from '@/constants';
import type { DependencySubscriber, Listener } from '@/tracking/tracking.types';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Tracks dependency.
 */
export function trackDependency<T>(
  dependency: Dependency,
  current: Listener,
  fnSubs: ((newValue?: T, oldValue?: T) => void)[],
  objSubs: Subscriber[]
): void {
  if (typeof current === 'function') {
    const fn = current as (newValue?: T, oldValue?: T) => void;
    // Check for existing subscription
    if (fnSubs.indexOf(fn) !== -1) return;

    fnSubs.push(fn);
    dependency.flags |= NODE_FLAGS.HAS_FN_SUBS;
    if ('_fnSubCount' in dependency) {
      (dependency as unknown as { _fnSubCount: number })._fnSubCount++;
    }
    return;
  }

  if ('addDependency' in (current as object)) {
    (current as DependencySubscriber).addDependency(dependency);
    return;
  }

  const sub = current as Subscriber;
  if (objSubs.indexOf(sub) !== -1) return;

  objSubs.push(sub);
  dependency.flags |= NODE_FLAGS.HAS_OBJ_SUBS;
  if ('_objSubCount' in dependency) {
    (dependency as unknown as { _objSubCount: number })._objSubCount++;
  }
}

/**
 * Syncs dependencies.
 */
export function syncDependencies(
  nextLinks: DependencyLink[],
  prevLinks: DependencyLink[],
  tracker: Subscriber
): void {
  for (let i = 0, len = prevLinks.length; i < len; i++) {
    const link = prevLinks[i];
    if (link) {
      link.node._tempUnsub = link.unsub;
    }
  }

  for (let i = 0, len = nextLinks.length; i < len; i++) {
    const link = nextLinks[i];
    if (!link) continue;

    const node = link.node;
    if (node._tempUnsub !== undefined) {
      // Re-link: Found in previous set, reclaim the subscription
      link.unsub = node._tempUnsub;
      node._tempUnsub = undefined; // Consumed
    } else {
      // New Link: Subscribe afresh
      debug.checkCircular(node, tracker);
      link.unsub = node.subscribe(tracker);
    }
  }

  for (let i = 0, len = prevLinks.length; i < len; i++) {
    const link = prevLinks[i];
    if (link) {
      const node = link.node;
      if (node._tempUnsub !== undefined) {
        node._tempUnsub(); // Release
        node._tempUnsub = undefined;
      }
      link.unsub = undefined;
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
