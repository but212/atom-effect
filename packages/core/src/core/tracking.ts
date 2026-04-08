import { IS_DEV } from '@/constants';
import { ERROR_MESSAGES } from '@/errors';
import type { Dependency, Subscriber } from '@/types';
import { isPromise } from '@/utils/type-guards';

// ── Tracking Types ──────────────────────────────────────────────────────

/**
 * Interface for objects that can consume dependencies.
 */
export interface DependencySubscriber {
  /**
   * Registers a dependency to this subscriber.
   */
  addDependency(dep: Dependency): void;
}

/**
 * Interface for objects that both consume dependencies and can be re-executed.
 */
export interface DependencyTracker extends DependencySubscriber, Subscriber {}

/**
 * A function that can participate in dependency tracking.
 * @internal
 */
export type TrackableFunction = (() => void) & DependencySubscriber;

// ── Graph Data Structures ───────────────────────────────────────────────

/**
 * Represents a connection in the dependency graph.
 * Held by the subscriber to track its dependencies.
 * @internal
 */
export class DependencyLink {
  constructor(
    /** The dependency being tracked. */
    public readonly node: Dependency,
    /** The version of the dependency when it was last tracked. */
    public version: number,
    /** Optional cleanup function to remove the subscription. */
    public unsub: (() => void) | undefined = undefined
  ) {}
}

/**
 * A notification entry within a dependency.
 * Dispatches updates to either a callback or an internal subscriber node.
 * @internal
 */
export class Subscription<T = unknown> {
  constructor(
    /** Callback for value-based change notifications. */
    public fn: ((newValue?: T, oldValue?: T) => void) | undefined = undefined,
    /** Subscriber node for graph-based re-execution. */
    public sub: Subscriber | undefined = undefined
  ) {}

  /**
   * Notifies the subscriber of a change.
   * Dispatches to the callback if present, otherwise executes the subscriber node.
   */
  public notify(newValue?: T, oldValue?: T): void {
    const fn = this.fn;
    if (fn !== undefined) {
      fn(newValue, oldValue);
      return;
    }

    const sub = this.sub;
    if (sub !== undefined) {
      sub.execute();
    }
  }
}

// ── Tracking Engine ─────────────────────────────────────────────────────

/**
 * Manages the global reactive tracking state.
 * Uses a stack-like mechanism via `run()` to handle nested tracking scopes.
 */
class TrackingContext {
  /** Private state to prevent accidental out-of-order mutations */
  private _current: DependencySubscriber | null = null;

  /** The currently active subscriber receiving new dependencies. */
  public get current(): DependencySubscriber | null {
    return this._current;
  }

  /** @internal - Direct mutation is risky; prioritized for internal engine use only. */
  public set current(value: DependencySubscriber | null) {
    this._current = value;
  }

  /**
   * Executes a function within the context of a subscriber.
   * Automatically handles context preservation and restoration.
   *
   * @param subscriber - The subscriber to track for.
   * @param fn - The function to execute.
   * @returns The result of the function execution.
   */
  public run<T>(subscriber: DependencySubscriber, fn: () => T): T {
    // Fast path: avoid context overhead if already in the target context
    if (this._current === subscriber) {
      return fn();
    }

    const prev = this._current;
    this._current = subscriber;
    try {
      return fn();
    } finally {
      this._current = prev;
    }
  }
}

/**
 * Global tracking context singleton.
 */
export const trackingContext = new TrackingContext();

export type { TrackingContext };

// ── Global Utilities ───────────────────────────────────────────────────

/**
 * Executes a function without creating any reactivity dependencies.
 *
 * @remarks
 * This function forbids `async` callbacks because tracking context is inherently
 * synchronous. For non-reactive reads in async code, use `atom.peek()` instead.
 *
 * @param fn - The logic to execute untracked.
 * @returns The result of the execution.
 * @throws {TypeError} If an async function (returning a Promise) is detected in DEV mode.
 */
export function untracked<T>(fn: () => T): T {
  const ctx = trackingContext;
  const prev = ctx.current;

  // Optimized: immediate execution if already untracked
  if (prev === null) {
    const result = fn();
    if (IS_DEV && isPromise(result)) {
      throw new TypeError(ERROR_MESSAGES.TRACKING_UNTRACKED_ASYNC);
    }
    return result;
  }

  ctx.current = null;
  try {
    const result = fn();
    if (IS_DEV && isPromise(result)) {
      throw new TypeError(ERROR_MESSAGES.TRACKING_UNTRACKED_ASYNC);
    }
    return result;
  } finally {
    ctx.current = prev;
  }
}
