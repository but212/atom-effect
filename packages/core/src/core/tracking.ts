import { IS_DEV } from '@/constants';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';
import { isPromise } from '@/utils/type-guards';

// ── Tracking Types ──────────────────────────────────────────────────────

/**
 * Dependency consumer.
 * Objects implementing this can be registered as the current tracking target.
 */
export interface DependencySubscriber {
  /**
   * Registers a dependency to this subscriber.
   */
  addDependency(dep: Dependency): void;
}

/**
 * Executable unit.
 * Represents a reactive node or effect that can be re-run.
 */
export interface ExecutableSubscriber {
  execute(): void;
}

/**
 * Dependency tracker.
 * Combines dependency collection and execution capabilities.
 */
export interface DependencyTracker extends DependencySubscriber, ExecutableSubscriber {}

/**
 * Trackable function.
 * A function that is also recognized as a dependency consumer.
 */
export type TrackableFunction = (() => void) & DependencySubscriber;

// ── Dependency Link & Subscription ───────────────────────────────────────

/**
 * Dependency graph edge.
 * Maintains the link between a subscriber and its dependency.
 */
export class DependencyLink {
  constructor(
    public node: Dependency,
    public version: number,
    /**
     * Unsubscribe cleanup function.
     * Default value ensures consistent V8 hidden class shape.
     */
    public unsub: (() => void) | undefined = undefined
  ) {}
}

/**
 * Subscription entry.
 */
export class Subscription<T> {
  constructor(
    /**
     * Optional callback. Always initialized to maintain hidden class.
     */
    public fn: ((newValue?: T, oldValue?: T) => void) | undefined = undefined,
    /**
     * Optional subscriber. Always initialized to maintain hidden class.
     */
    public sub: Subscriber | undefined = undefined
  ) {}

  /**
   * Notifies the subscriber of a value change.
   *
   * Optimization: Inlined 'untracked' logic to eliminate closure allocation in notification hot-path.
   * It ensures any reactive access during notification doesn't create accidental dependency cycles.
   */
  notify(newValue?: T, oldValue?: T): void {
    const fn = this.fn;
    const sub = this.sub;

    if (fn === undefined && sub === undefined) return;

    const ctx = trackingContext;
    const prev = ctx.current;

    if (prev === null) {
      if (fn !== undefined) fn(newValue, oldValue);
      if (sub !== undefined) sub.execute();
      return;
    }

    // Logic: Context switch required for notification safety.
    ctx.current = null;
    try {
      if (fn !== undefined) fn(newValue, oldValue);
      if (sub !== undefined) sub.execute();
    } finally {
      ctx.current = prev;
    }
  }
}

// ── Tracking Context ────────────────────────────────────────────────────

/**
 * Tracking context implementation.
 */
class TrackingContext {
  /** Active subscriber at the top of the stack. */
  public current: DependencySubscriber | null = null;

  /**
   * Executes a function within the scope of a specific subscriber.
   *
   * @param subscriber - The subscriber to collect dependencies for.
   * @param fn - The logic to execute.
   * @returns The result of `fn`.
   */
  public run<T>(subscriber: DependencySubscriber, fn: () => T): T {
    if (this.current === subscriber) {
      return fn();
    }

    const prev = this.current;
    this.current = subscriber;

    try {
      if (!IS_DEV) return fn();

      const result = fn();

      debug.warn(
        isPromise(result),
        'Detected Promise returned within tracking context. ' +
          'Dependencies accessed after "await" will NOT be tracked. ' +
          'Consider using synchronous tracking before the async boundary.'
      );

      return result;
    } finally {
      // Constraint: Synchronous restoration is required for safety in multi-tasking environments.
      this.current = prev;
    }
  }
}

/**
 * Global tracking context singleton.
 */
export const trackingContext = new TrackingContext();

/**
 * Tracking context type.
 */
export type { TrackingContext };

// ── Untracked ───────────────────────────────────────────────────────────

/**
 * Executes a function without dependency tracking.
 *
 * When to use:
 * - To read reactive state without creating a dependency link.
 * - To perform side effects inside a computation that shouldn't trigger re-runs.
 *
 * @param fn - Function to execute.
 * @returns Result of `fn`.
 *
 * @example
 * ```typescript
 * effect(() => {
 *   const val = untracked(() => someAtom.value);
 *   console.log('Read without tracking:', val);
 * });
 * ```
 */
export function untracked<T>(fn: () => T): T {
  const ctx = trackingContext;
  const prev = ctx.current;

  if (prev === null) {
    return fn();
  }

  ctx.current = null;
  try {
    return fn();
  } finally {
    ctx.current = prev;
  }
}
