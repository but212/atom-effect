import { NODE_FLAGS } from '@/constants';
import { EMPTY_DEPS, EMPTY_UNSUBS, unsubArrayPool } from '@/internal/pool';
import type { DependencySubscriber } from '@/tracking/tracking.types';
import type { Dependency, HasFlags, Subscriber } from '@/types';
import { debug } from '@/utils/debug';

export function trackDependency<T>(
  dependency: Dependency,
  current: unknown,
  functionSubscribers: ((newValue?: T, oldValue?: T) => void)[],
  objectSubscribers: Subscriber[]
): void {
  // Guard: No context means no tracking
  if (!current) return;

  // Most frequent path: Structured trackers (Effect, Computed)
  if (typeof current === 'object' || typeof current === 'function') {
    const trackable = current as HasFlags;
    if (trackable.flags !== undefined && trackable.flags & NODE_FLAGS.IS_TRACKER) {
      (trackable as unknown as DependencySubscriber).addDependency(dependency);
      return;
    }

    // Manual functional subscribers
    if (typeof current === 'function') {
      const fn = current as (newValue?: T, oldValue?: T) => void;
      // O(N) check - typically very small N for manual subscribers
      if (functionSubscribers.indexOf(fn) === -1) {
        functionSubscribers.push(fn);
        dependency.flags |= NODE_FLAGS.HAS_FN_SUBS;
      }
      return;
    }

    // Manual object subscribers with execute method
    const sub = current as Subscriber;
    if (typeof sub.execute === 'function') {
      if (objectSubscribers.indexOf(sub) === -1) {
        objectSubscribers.push(sub);
        dependency.flags |= NODE_FLAGS.HAS_OBJ_SUBS;
      }
    }
  }
}

/**
 * Synchronizes subscriptions using an O(N) strategy optimized for cache locality.
 * Avoids O(N^2) Map/Set lookup overhead for dependency reconciliation.
 */
export function syncDependencies(
  nextDeps: Dependency[],
  prevDeps: Dependency[],
  prevUnsubs: (() => void)[],
  tracker: Subscriber
): (() => void)[] {
  const nextLen = nextDeps.length;
  const prevLen = prevDeps.length;

  // Fast path: Immediate cleanup if no new dependencies
  if (nextLen === 0) {
    if (prevDeps !== EMPTY_DEPS) {
      for (let i = 0; i < prevLen; i++) {
        const unsub = prevUnsubs[i];
        if (unsub) unsub();
      }
      if (prevUnsubs !== EMPTY_UNSUBS) unsubArrayPool.release(prevUnsubs);
    }
    return EMPTY_UNSUBS;
  }

  const hasPrev = prevDeps !== EMPTY_DEPS && prevLen > 0;

  // Optimization: Identity check for unchanged graphs (Fastest path for re-evaluations)
  if (hasPrev && nextLen === prevLen) {
    let identical = true;
    for (let i = 0; i < nextLen; i++) {
      if (nextDeps[i] !== prevDeps[i]) {
        identical = false;
        break;
      }
    }
    if (identical) return prevUnsubs;
  }

  // Mapping stage: Tag existing dependencies with their unsubscribe functions
  if (hasPrev) {
    for (let i = 0; i < prevLen; i++) {
      const dep = prevDeps[i];
      if (dep) dep._tempUnsub = prevUnsubs[i];
    }
  }

  const nextUnsubs = unsubArrayPool.acquire();
  nextUnsubs.length = nextLen;

  // Reconciliation stage: Reuse existing unsubs or create new ones
  for (let i = 0; i < nextLen; i++) {
    const dep = nextDeps[i];
    if (!dep) continue;

    const reuse = dep._tempUnsub;
    if (reuse) {
      nextUnsubs[i] = reuse;
      dep._tempUnsub = undefined; // Consumed
    } else {
      // Circular check only needed for truly new subscriptions
      debug.checkCircular(dep, tracker);
      nextUnsubs[i] = dep.subscribe(tracker);
    }
  }

  // Cleanup stage: Finalize unsubscriptions for removed dependencies
  if (hasPrev) {
    for (let i = 0; i < prevLen; i++) {
      const dep = prevDeps[i];
      if (dep) {
        const unsub = dep._tempUnsub;
        if (unsub) {
          unsub();
          dep._tempUnsub = undefined;
        }
      }
    }
    if (prevUnsubs !== EMPTY_UNSUBS) {
      unsubArrayPool.release(prevUnsubs);
    }
  }

  return nextUnsubs;
}
