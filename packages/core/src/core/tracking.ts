import type { Dependency, Subscriber } from '@/types';

// ── Tracking Types ──────────────────────────────────────────────────────

/**
 * Dependency consumer.
 */
export interface DependencySubscriber {
  /**
   * Registers dependency.
   */
  addDependency(dep: Dependency): void;
}

/**
 * Executable unit.
 */
export interface ExecutableSubscriber {
  execute(): void;
}

/**
 * Dependency tracker.
 */
export interface DependencyTracker extends DependencySubscriber, ExecutableSubscriber {}

/**
 * Trackable function.
 */
export type TrackableFunction = (() => void) & DependencySubscriber;

// ── Dependency Link & Subscription ───────────────────────────────────────

/**
 * Dependency graph edge.
 */
export class DependencyLink {
  constructor(
    public node: Dependency,
    public version: number,
    // Always initialize to maintain consistent V8 hidden class
    public unsub: (() => void) | undefined = undefined
  ) {}
}

/**
 * Subscription entry.
 */
export class Subscription<T> {
  constructor(
    // Always initialize both properties to maintain consistent V8 hidden class
    public fn: ((newValue?: T, oldValue?: T) => void) | undefined,
    public sub: Subscriber | undefined
  ) {}

  notify(newValue?: T, oldValue?: T): void {
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

// ── Tracking Context ────────────────────────────────────────────────────

/**
 * Tracking context implementation.
 */
class TrackingContext {
  /** Active subscriber. */
  public current: DependencySubscriber | null = null;

  /**
   * Executes in context.
   *
   * @param subscriber - The subscriber.
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
      return fn();
    } finally {
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
 * Untracked execution.
 *
 * @param fn - Function to execute.
 * @returns Result of `fn`.
 */
export function untracked<T>(fn: () => T): T {
  const ctx = trackingContext;
  const prev = ctx.current;

  // Optimized: Fast-path when already untracked
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
