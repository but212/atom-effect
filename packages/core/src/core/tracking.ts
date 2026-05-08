import { Result } from '@but212/atom-effect-utils';
import type { Dependency, Subscriber } from '@/types';

/**
 * Interface for nodes capable of recording reactive dependencies during execution.
 * @internal
 *
 * Reason: Decouples dependency collection from the specific node implementation,
 * allowing any object to participate in tracking as long as it can record dependencies.
 */
export interface DependencySubscriber {
  addDependency(dep: Dependency): void;
}

/**
 * Interface for nodes that can be scheduled for re-execution.
 * @internal
 *
 * Reason: Provides a unified interface for the scheduler to trigger updates
 * without knowing the internal logic of the node.
 */
export interface ExecutableSubscriber {
  execute(): void;
}

/**
 * Unified interface for nodes that both consume dependencies and execute logic.
 * (e.g., Effects, Computed Atoms, Observers)
 * @internal
 */
export interface DependencyTracker extends DependencySubscriber, ExecutableSubscriber {}

/**
 * Represents a single directed edge in the dependency graph (Subscriber -> Dependency).
 * @internal
 *
 * Logic: Includes a version field to implement efficient stale checks.
 * If the dependency's version doesn't match this version, the subscriber may need re-evaluation.
 */
export interface DependencyLink {
  /** The node being watched. */
  node: Dependency;
  /** The version of the node when this link was established. */
  version: number;
  /** Cleanup function returned by the dependency. */
  unsub: (() => void) | undefined;
}

/** @internal */
export function createDependencyLink(
  node: Dependency,
  version: number,
  unsub: (() => void) | undefined = undefined
): DependencyLink {
  return { node, version, unsub };
}

/**
 * A handle for an active listener on a reactive node.
 * Supports both raw callbacks and internal graph subscribers.
 * @internal
 */
export interface Subscription<T> {
  /** Raw callback for external listeners. */
  fn: ((newValue?: T, oldValue?: T) => void) | undefined;
  /** Internal subscriber for graph-based updates. */
  sub: Subscriber | undefined;
}

/** @internal */
export function createSubscription<T>(
  fn: ((newValue?: T, oldValue?: T) => void) | undefined = undefined,
  sub: Subscriber | undefined = undefined
): Subscription<T> {
  return { fn, sub };
}

/** @internal */
export function notifySubscription<T>(
  subscription: Subscription<T> | null,
  newValue?: T,
  oldValue?: T
): void {
  if (subscription === null) return;

  // Logic: Failure Isolation
  // Uses Result.tryCatch to ensure that a failing listener or subscriber
  // does not interrupt the notification cycle for other nodes.
  const result = Result.tryCatch(() => {
    const { fn, sub } = subscription;
    if (fn !== undefined) fn(newValue, oldValue);
    if (sub !== undefined) sub.execute();
  });

  Result.match(result, {
    ok: () => {},
    err: (e) => {
      console.error('[atom-effect] Subscriber failed:', e);
    },
  });
}

/**
 * Internal state for the reactive tracking system.
 * @internal
 *
 * Logic: Stack-based approach
 * The stack enables nested tracking. When a computed atom is read inside an effect,
 * the computed atom becomes the 'current' subscriber while it calculates its value,
 * and the effect is restored as 'current' after the computation finishes.
 */
export interface TrackingContext {
  stack: (DependencySubscriber | null)[];
  current: DependencySubscriber | null;
}

/** @internal */
export function createTrackingContext(): TrackingContext {
  return { stack: [], current: null };
}

/** @internal */
export function pushTrackingSubscriber(
  context: TrackingContext,
  subscriber: DependencySubscriber | null
): void {
  context.stack.push(subscriber);
  context.current = subscriber;
}

/** @internal */
export function popTrackingSubscriber(context: TrackingContext): void {
  const stack = context.stack;
  stack.pop();
  const len = stack.length;
  context.current = len > 0 ? stack[len - 1]! : null;
}

/**
 * Resets the tracking stack to a specific depth.
 * @internal
 *
 * Reason: Used during error recovery or transaction rollbacks where
 * the execution stack might be corrupted or partially executed.
 */
export function rollbackTrackingSubscriber(context: TrackingContext, depth: number): void {
  const stack = context.stack;
  stack.length = depth;
  const len = stack.length;
  context.current = len > 0 ? stack[len - 1]! : null;
}

/**
 * Executes a function within the scope of a specific subscriber.
 * @internal
 */
export function runInTrackingContext<T>(
  context: TrackingContext,
  subscriber: DependencySubscriber,
  fn: () => T
): T {
  // Optimization: Avoid redundant stack operations if already in the same context.
  if (context.current === subscriber) return fn();

  pushTrackingSubscriber(context, subscriber);
  try {
    return fn();
  } finally {
    popTrackingSubscriber(context);
  }
}

/** @internal */
export function resetTrackingContext(context: TrackingContext): void {
  context.stack.length = 0;
  context.current = null;
}

export const trackingContext = createTrackingContext();

/**
 * Executes a function scope where reactive dependencies are ignored.
 *
 * When to use:
 * - Accessing atom values inside an effect or computed without creating a dependency.
 * - Performing side-effects (logging, analytics) that shouldn't trigger re-runs.
 * - Breaking circular dependencies by reading a value "silently".
 *
 * @param fn - The function to execute in an untracked scope.
 * @returns The result of the function.
 *
 * @example
 * ```typescript
 * const count = atom(0);
 * effect(() => {
 *   // This effect only runs when count changes.
 *   const current = count.value;
 *
 *   untracked(() => {
 *     // This read does NOT create a dependency.
 *     // It won't cause the effect to re-run if logging was reactive.
 *     console.log('Logging untracked value:', count.value);
 *   });
 * });
 * ```
 */
export function untracked<T>(fn: () => T): T {
  if (trackingContext.current === null) return fn();

  pushTrackingSubscriber(trackingContext, null);
  try {
    return fn();
  } finally {
    popTrackingSubscriber(trackingContext);
  }
}
