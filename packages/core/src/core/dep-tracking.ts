import { NODE_FLAGS } from '@/constants';
import { EMPTY_DEPS, EMPTY_UNSUBS, unsubArrayPool } from '@/internal/pool';
import type { DependencySubscriber } from '@/tracking/tracking.types';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';

export function trackDependency<T>(
  dependency: Dependency,
  current: unknown,
  functionSubscribers: ((newValue?: T, oldValue?: T) => void)[],
  objectSubscribers: Subscriber[]
): void {
  if (current === null || current === undefined) return;

  // Inlined from hasDependencyMethod to avoid call overhead
  if (
    (typeof current === 'object' || typeof current === 'function') &&
    typeof (current as DependencySubscriber).addDependency === 'function'
  ) {
    (current as DependencySubscriber).addDependency(dependency);
    return;
  }

  if (typeof current === 'function') {
    const subscriber = current as (newValue?: T, oldValue?: T) => void;
    // O(N) check - typically small N
    if (functionSubscribers.indexOf(subscriber) === -1) {
      functionSubscribers.push(subscriber);
      dependency.flags |= NODE_FLAGS.HAS_FN_SUBS;
    }
    return;
  }

  // Inlined from hasExecuteMethod
  if (typeof current === 'object' && typeof (current as Subscriber).execute === 'function') {
    if (objectSubscribers.indexOf(current as Subscriber) === -1) {
      objectSubscribers.push(current as Subscriber);
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
  const nextLen = nextDeps.length;
  const prevLen = prevDeps.length;
  const hasPrev = prevDeps !== EMPTY_DEPS && prevLen > 0;

  // 1. Initial dense pass: map existing unsubs to dependencies
  if (hasPrev) {
    for (let i = 0; i < prevLen; i++) {
      const dep = prevDeps[i];
      if (dep) dep._tempUnsub = prevUnsubs[i];
    }
  }

  // 2. Build new unsubs array: reuse or subscribe
  const nextUnsubs = unsubArrayPool.acquire();
  nextUnsubs.length = nextLen;

  for (let i = 0; i < nextLen; i++) {
    const dep = nextDeps[i];
    if (!dep) continue;

    const reuse = dep._tempUnsub;
    if (reuse) {
      nextUnsubs[i] = reuse;
      dep._tempUnsub = undefined;
    } else {
      // Keep checkCircular outside debug.enabled guard if tests rely on global spying
      debug.checkCircular(dep, tracker);
      nextUnsubs[i] = dep.subscribe(tracker);
    }
  }

  // 3. Final cleanup pass: unsubscribe stale dependencies
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
  }

  if (prevUnsubs !== EMPTY_UNSUBS) {
    unsubArrayPool.release(prevUnsubs);
  }

  return nextUnsubs;
}
