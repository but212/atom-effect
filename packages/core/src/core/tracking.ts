import { Result } from '@but212/atom-effect-utils';
import { IS_DEV } from '@/constants';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';
import { isPromise } from '@/utils/type-guards';

// ── Tracking Types ──────────────────────────────────────────────────────

/**
 * Interface for nodes that record reactive dependencies during execution.
 */
export interface DependencySubscriber {
  addDependency(dep: Dependency): void;
}

/**
 * Interface for nodes that can be scheduled for re-execution.
 */
export interface ExecutableSubscriber {
  execute(): void;
}

/**
 * Unified interface for nodes that both consume dependencies and execute logic.
 */
export interface DependencyTracker extends DependencySubscriber, ExecutableSubscriber {}

export type TrackableFunction = (() => void) & DependencySubscriber;

// ── Dependency Link & Subscription ───────────────────────────────────────

/**
 * Represents a single directed edge in the dependency graph (Subscriber -> Dependency).
 *
 * Performance: Fields are explicitly initialized to maintain V8's Hidden Class (Shape)
 * optimization for high-frequency object creation.
 */
export interface DependencyLink {
  /** The node being watched. */
  node: Dependency;
  /** The version of the node when this link was established. Used for staleness checks. */
  version: number;
  /**
   * Cleanup function returned by the dependency.
   * @internal
   */
  unsub: (() => void) | undefined;
}

export function createDependencyLink(
  node: Dependency,
  version: number,
  unsub: (() => void) | undefined = undefined
): DependencyLink {
  return { node, version, unsub };
}

/**
 * A handle for an active listener on a reactive node.
 */
export interface Subscription<T> {
  /** Raw callback for external listeners. @internal */
  fn: ((newValue?: T, oldValue?: T) => void) | undefined;
  /** Internal subscriber for graph-based updates. @internal */
  sub: Subscriber | undefined;
}

export function createSubscription<T>(
  fn: ((newValue?: T, oldValue?: T) => void) | undefined = undefined,
  sub: Subscriber | undefined = undefined
): Subscription<T> {
  return { fn, sub };
}

/**
 * Triggers a subscription's update logic.
 *
 * Caution: Pushes 'null' to the tracking context before execution to ensure
 * that side-effects or listener logic don't accidentally create new dependencies
 * or recursive loops during the notification phase.
 */
export function notifySubscription<T>(
  subscription: Subscription<T>,
  newValue?: T,
  oldValue?: T
): void {
  const { fn, sub } = subscription;
  if (fn === undefined && sub === undefined) return;

  trackingContext.push(null);
  try {
    if (fn !== undefined) fn(newValue, oldValue);
    if (sub !== undefined) sub.execute();
  } catch (e) {
    console.error('[atom-effect] Subscriber failed:', e);
  } finally {
    trackingContext.pop();
  }
}

// ── Tracking Context ────────────────────────────────────────────────────

/**
 * Global stack-based manager for reactive scopes.
 *
 * Why a stack? Reactive nodes can be nested (e.g., a Computed reading another Computed).
 * The stack ensures that dependencies are attributed to the correct parent node.
 */
class TrackingContext {
  /** Stack of subscribers. null indicates an 'untracked' zone. */
  private readonly _stack: (DependencySubscriber | null)[] = [];

  public get current(): DependencySubscriber | null {
    const len = this._stack.length;
    return len > 0 ? this._stack[len - 1]! : null;
  }

  public push(subscriber: DependencySubscriber | null): void {
    this._stack.push(subscriber);
  }

  public pop(): void {
    this._stack.pop();
  }

  /**
   * Runs a function while attributing all reactive reads to the provided subscriber.
   *
   * Warning: In development, this warns if a Promise is returned.
   * Tracking context is synchronous and will be lost after the first 'await'.
   */
  public run<T>(subscriber: DependencySubscriber, fn: () => T): Result<T, Error> {
    if (this.current === subscriber) return Result.tryCatch(fn);

    this.push(subscriber);
    try {
      const res = Result.tryCatch(fn);
      if (IS_DEV && res.ok && isPromise(res.value)) {
        debug.warn(
          true,
          'Promise detected in tracking context: dependencies after "await" will be lost.'
        );
      }
      return res;
    } finally {
      this.pop();
    }
  }
}

export const trackingContext = new TrackingContext();

export type { TrackingContext };

// ── Untracked ───────────────────────────────────────────────────────────

/**
 * Executes a scope where reactive dependencies are ignored.
 *
 * Use when:
 * - Reading values purely for logging or one-off logic.
 * - Modifying state inside an effect that shouldn't re-trigger itself.
 *
 * @example
 * ```typescript
 * effect(() => {
 *   // We want to log the value, but NOT re-run when atomA changes.
 *   const val = untracked(() => atomA.value);
 *   console.log(val);
 * });
 * ```
 */
export function untracked<T>(fn: () => T): T {
  if (trackingContext.current === null) return fn();

  trackingContext.push(null);
  try {
    return fn();
  } finally {
    trackingContext.pop();
  }
}
