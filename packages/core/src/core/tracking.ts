import { Err, Ok, type Result } from '@but212/atom-effect-utils';
import { IS_DEV } from '@/constants';
import type { Dependency, Subscriber } from '@/types';
import { debug } from '@/utils/debug';
import { isPromise } from '@/utils/type-guards';

// ── Tracking Types ──────────────────────────────────────────────────────

/**
 * An interface for objects capable of consuming reactive dependencies.
 */
export interface DependencySubscriber {
  /**
   * Registers a dependency to this subscriber during a tracking cycle.
   */
  addDependency(dep: Dependency): void;
}

/**
 * An interface for objects that can be executed as a unit of reactive work.
 */
export interface ExecutableSubscriber {
  /**
   * Triggers the execution of the reactive node or effect.
   */
  execute(): void;
}

/**
 * A unified interface combining dependency collection and execution capabilities.
 */
export interface DependencyTracker extends DependencySubscriber, ExecutableSubscriber {}

/**
 * A function type that also serves as a dependency consumer.
 */
export type TrackableFunction = (() => void) & DependencySubscriber;

// ── Dependency Link & Subscription ───────────────────────────────────────

/**
 * Represents an edge in the dependency graph between a subscriber and a dependency.
 *
 * This class is designed to maintain a consistent V8 hidden class shape by ensuring
 * all fields are initialized in the constructor.
 */
export class DependencyLink {
  constructor(
    /** The reactive node being depended upon. */
    public node: Dependency,
    /** The version of the dependency at the time of tracking. */
    public version: number,
    /**
     * The cleanup function to terminate the subscription.
     * @internal
     */
    public unsub: (() => void) | undefined = undefined
  ) {}
}

/**
 * Represents a registration entry for a reactive subscriber.
 */
export class Subscription<T> {
  constructor(
    /**
     * An optional callback function to invoke on change.
     * @internal
     */
    public fn: ((newValue?: T, oldValue?: T) => void) | undefined = undefined,
    /**
     * An optional Subscriber object to execute on change.
     * @internal
     */
    public sub: Subscriber | undefined = undefined
  ) {}

  /**
   * Dispatches a notification to the registered listener or subscriber.
   *
   * Logic: The method performs a context switch by temporarily clearing the
   * active tracking context. This ensures that any reactive property access
   * occurring within a subscriber's callback does not create accidental
   * dependency cycles.
   *
   * Optimization: The `untracked` logic is inlined here to eliminate closure
   * allocation overhead in the notification hot-path.
   */
  notify(newValue?: T, oldValue?: T): void {
    const { fn, sub } = this;
    if (fn === undefined && sub === undefined) return;

    // Logic: Context switch is required to maintain notification safety and prevent cycles.
    // Optimization: We use untracked to encapsulate context management and reduce complexity.
    untracked(() => {
      if (fn !== undefined) fn(newValue, oldValue);
      if (sub !== undefined) sub.execute();
    });
  }
}

// ── Tracking Context ────────────────────────────────────────────────────

/**
 * Manages the global singleton state for automatic dependency collection.
 *
 * This class maintains the current active subscriber and provides a mechanism
 * to execute functions within a specific reactive scope.
 */
class TrackingContext {
  /** The current active subscriber at the top of the execution stack. */
  public current: DependencySubscriber | null = null;

  /**
   * Executes a function within the scope of a specific subscriber and returns the result as Data.
   *
   * @param subscriber - The subscriber to collect dependencies for.
   * @param fn - The logic to execute.
   * @returns A Result containing the success value or the captured error.
   */
  public run<T>(subscriber: DependencySubscriber, fn: () => T): Result<T, Error> {
    if (this.current === subscriber) {
      try {
        return Ok(fn());
      } catch (e) {
        return Err(e as Error);
      }
    }

    const prev = this.current;
    this.current = subscriber;

    try {
      const result = fn();

      if (IS_DEV && isPromise(result)) {
        debug.warn(
          true,
          'Detected Promise returned within tracking context. ' +
            'Dependencies accessed after an "await" boundary will NOT be captured. ' +
            'Ensure all reactive dependencies are accessed before the first asynchronous operation.'
        );
      }

      return Ok(result);
    } catch (e) {
      return Err(e as Error);
    } finally {
      // Constraint: Restoration of the previous context is required to ensure tracking integrity.
      this.current = prev;
    }
  }
}

/**
 * The global tracking context singleton.
 */
export const trackingContext = new TrackingContext();

/**
 * The type representing the global tracking context.
 */
export type { TrackingContext };

// ── Untracked ───────────────────────────────────────────────────────────

/**
 * Executes a function without recording any reactive dependencies.
 *
 * When to use:
 * - To read the value of an atom or computed without subscribing to its changes.
 * - To perform side effects inside a reactive computation that should not trigger re-runs.
 * - To prevent infinite dependency loops in complex reactive interactions.
 *
 * @param fn - The function to execute.
 * @returns The result of the provided function.
 *
 * @example
 * ```typescript
 * import { effect, untracked } from '@but212/atom-effect';
 *
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

  // Logic: Suspend tracking by temporarily clearing the current subscriber.
  ctx.current = null;
  try {
    return fn();
  } finally {
    ctx.current = prev;
  }
}
