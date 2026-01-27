import { NODE_FLAGS } from '@/constants';
import { EMPTY_UNSUBS, unsubArrayPool } from '@/internal/pool';
import type { DependencySubscriber } from '@/tracking/tracking.types';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';

/**
 * Tracks a dependency for the current reactive context.
 */
export function trackDependency<T>(
  dependency: Dependency,
  current: unknown,
  functionSubscribers: ((newValue?: T, oldValue?: T) => void)[],
  objectSubscribers: Subscriber[]
): void {
  if (current == null) return;

  // 1. DependencySubscriber path (Computed, Effect)
  if (typeof (current as DependencySubscriber).addDependency === 'function') {
    (current as DependencySubscriber).addDependency(dependency);
    return;
  }

  // 2. Manual function listeners
  if (typeof current === 'function') {
    const fn = current as (newValue?: T, oldValue?: T) => void;
    if (functionSubscribers.indexOf(fn) === -1) {
      functionSubscribers.push(fn);
      dependency.flags |= NODE_FLAGS.HAS_FN_SUBS;
    }
    return;
  }

  // 3. Subscriber objects with 'execute' method
  if (typeof (current as Subscriber).execute === 'function') {
    const sub = current as Subscriber;
    if (objectSubscribers.indexOf(sub) === -1) {
      objectSubscribers.push(sub);
      dependency.flags |= NODE_FLAGS.HAS_OBJ_SUBS;
    }
  }
}

/**
 * Synchronizes subscriptions using an O(N) strategy optimized for cache locality.
 */
export function syncDependencies(
  nextDeps: Dependency[],
  prevDeps: Dependency[],
  prevUnsubs: (() => void)[],
  tracker: Subscriber
): (() => void)[] {
  const prevLen = prevDeps.length;

  if (prevLen > 0) {
    for (let i = 0; i < prevLen; i++) {
      const dep = prevDeps[i];
      if (dep) {
        dep._tempUnsub = prevUnsubs[i];
      }
    }
  }

  const nextLen = nextDeps.length;
  const nextUnsubs = unsubArrayPool.acquire();
  nextUnsubs.length = nextLen;

  for (let i = 0; i < nextLen; i++) {
    const dep = nextDeps[i];
    if (!dep) continue;

    const existingUnsub = dep._tempUnsub;
    if (existingUnsub) {
      nextUnsubs[i] = existingUnsub;
      dep._tempUnsub = undefined;
    } else {
      // New dependency found
      debug.checkCircular(dep, tracker);
      nextUnsubs[i] = dep.subscribe(tracker);
    }
  }

  if (prevLen > 0) {
    for (let i = 0; i < prevLen; i++) {
      const dep = prevDeps[i];
      if (dep) {
        const remainingUnsub = dep._tempUnsub;
        if (remainingUnsub) {
          remainingUnsub();
          dep._tempUnsub = undefined;
        }
      }
    }
  }

  // Release old array to pool
  if (prevUnsubs !== EMPTY_UNSUBS) {
    unsubArrayPool.release(prevUnsubs);
  }

  return nextUnsubs;
}
