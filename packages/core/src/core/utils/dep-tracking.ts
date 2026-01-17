import { EMPTY_DEPS, EMPTY_UNSUBS, unsubArrayPool } from '@/internal/pool';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';
import type { SubscriberManager } from '@/utils/subscriber-manager';
import { hasDependencyMethod, hasExecuteMethod, isPlainListener } from '@/utils/type-guards';

/**
 * Shared utility for handling dependency tracking.
 * Centralizes the logic for registering a dependency with the current listener/tracking context.
 */
export class DependencyTracker {
  /**
   * Registers a dependency with the current listener (if any).
   *
   * @param dependency - The reactive node to be tracked (Atom or Computed)
   * @param current - The current listener from the tracking context
   * @param functionSubscribers - Manager for function-based subscribers
   * @param objectSubscribers - Manager for object-based subscribers
   */
  static track<T>(
    dependency: Dependency,
    current: unknown,
    functionSubscribers: SubscriberManager<(newValue?: T, oldValue?: T) => void>,
    objectSubscribers: SubscriberManager<Subscriber>
  ): void {
    if (!current) return;

    // Priority 1: TrackableListener pattern (addDependency method)
    // Used by Computed atoms to collect dependencies
    if (hasDependencyMethod(current)) {
      current.addDependency(dependency);
      return;
    }

    // Priority 2: Plain function callback
    // Used by simple effects or manual tracking
    if (isPlainListener(current)) {
      functionSubscribers.add(current as (newValue?: T, oldValue?: T) => void);
      return;
    }

    // Priority 3: Subscriber pattern (execute method)
    // Used by Effect objects or other subscribers
    if (hasExecuteMethod(current)) {
      objectSubscribers.add(current);
    }
  }
}

/**
 * Synchronizes subscriptions based on dependency changes using O(N) strategy.
 * Maps unsubs 1:1 with dependencies array.
 *
 * Shared logic for Computed and Effect to manage their dependencies.
 *
 * @param nextDeps - The new list of dependencies collected
 * @param prevDeps - The previous list of dependencies
 * @param prevUnsubs - The previous list of unsubscribe functions
 * @param tracker - The object tracking these dependencies (Computed or Effect)
 * @returns The new list of unsubscribe functions
 */
export function syncDependencies(
  nextDeps: Dependency[],
  prevDeps: Dependency[],
  prevUnsubs: (() => void)[],
  tracker: Subscriber
): (() => void)[] {
  // 1. Map existing subscriptions to dependencies for O(1) lookup during sync
  if (prevDeps !== EMPTY_DEPS && prevUnsubs !== EMPTY_UNSUBS) {
    for (let i = 0; i < prevDeps.length; i++) {
      const dep = prevDeps[i];
      if (dep) dep._tempUnsub = prevUnsubs[i];
    }
  }

  // 2. Build new unsubscribe array
  const nextUnsubs = unsubArrayPool.acquire();

  // Ensure nextUnsubs has same length as nextDeps
  nextUnsubs.length = nextDeps.length;

  for (let i = 0; i < nextDeps.length; i++) {
    const dep = nextDeps[i];
    if (!dep) continue;

    if (dep._tempUnsub) {
      // Reuse existing subscription
      nextUnsubs[i] = dep._tempUnsub;
      dep._tempUnsub = undefined; // Consumed
    } else {
      debug.checkCircular(dep, tracker);
      nextUnsubs[i] = dep.subscribe(tracker);
    }
  }

  // 3. Cleanup unused subscriptions (from removals)
  if (prevDeps !== EMPTY_DEPS) {
    for (let i = 0; i < prevDeps.length; i++) {
      const dep = prevDeps[i];
      if (dep?._tempUnsub) {
        // Still has _tempUnsub => was not reused in nextDeps => Removed
        dep._tempUnsub();
        dep._tempUnsub = undefined;
      }
    }
  }

  // 4. Release old unsub array
  if (prevUnsubs !== EMPTY_UNSUBS) {
    unsubArrayPool.release(prevUnsubs);
  }

  return nextUnsubs;
}
