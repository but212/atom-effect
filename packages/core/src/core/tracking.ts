import { Result } from '@but212/atom-effect-utils';
import type { Dependency, Subscriber } from '@/types';

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
 * Optimization: Context Recovery
 * Uses the trackingContext.depth pointer to restore the context even if a subscriber
 * fails, avoiding the overhead of try-finally in the common case.
 */
export function notifySubscription<T>(
  subscription: Subscription<T> | null,
  newValue?: T,
  oldValue?: T
): void {
  if (subscription === null) return;

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
  /** Cached reference to the top of the stack for faster O(1) access. */
  private _current: DependencySubscriber | null = null;

  public get current(): DependencySubscriber | null {
    return this._current;
  }

  /**
   * Returns the current stack depth. Used for deterministic context recovery.
   */
  public get depth(): number {
    return this._stack.length;
  }

  /**
   * Resets the context to a specific depth. Used by error boundaries.
   */
  public rollback(depth: number): void {
    const stack = this._stack;
    stack.length = depth;
    const len = stack.length;
    this._current = len > 0 ? stack[len - 1]! : null;
  }

  /**
   * Completely clears the tracking context.
   */
  public reset(): void {
    this._stack.length = 0;
    this._current = null;
  }

  public push(subscriber: DependencySubscriber | null): void {
    this._stack.push(subscriber);
    this._current = subscriber;
  }

  public pop(): void {
    const stack = this._stack;
    stack.pop();
    const len = stack.length;
    this._current = len > 0 ? stack[len - 1]! : null;
  }

  /**
   * Runs a function while attributing all reactive reads to the provided subscriber.
   *
   * Optimization: Deterministic Error Handling
   * This method no longer uses try-finally or Result.tryCatch. It assumes success
   * and relies on the caller to rollback the context depth on error.
   */
  public run<T>(subscriber: DependencySubscriber, fn: () => T): T {
    if (this._current === subscriber) return fn();

    this.push(subscriber);
    const res = fn();
    this.pop();
    return res;
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
  const res = fn();
  trackingContext.pop();
  return res;
}
