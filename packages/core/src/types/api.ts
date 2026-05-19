/**
 * @module APITypes
 *
 * Responsibility:
 * Defines the public configuration interfaces for atoms, computed values,
 * and side-effects.
 */

/**
 * Configuration for initializing a state source (Atom).
 */
export interface AtomOptions<T = unknown> {
  /**
   * A unique name for the atom. Used for identification in devtools and
   * diagnostic warning messages.
   */
  name?: string;
  /**
   * When true, state changes bypass the batching scheduler.
   *
   * When to use:
   * - For critical UI updates (e.g., input focus, scroll position) that
   *   must be visible in the same browser frame.
   *
   * Caution:
   * - Can lead to "glitches" or redundant re-computations in complex graphs.
   */
  sync?: boolean;
  /**
   * A custom comparison function to determine if a state update should
   * be ignored. Defaults to `Object.is`.
   */
  equal?: (a: T, b: T) => boolean;
}

/**
 * Configuration for derived reactive values (Computed).
 */
export interface ComputedOptions<T = unknown> {
  /** Identification name for debugging purposes. */
  name?: string;
  /** Custom comparison function to prune redundant downstream updates. */
  equal?: (a: T, b: T) => boolean;
  /**
   * An initial value returned if accessed before the first computation
   * completes (e.g., during an initial async fetch).
   */
  defaultValue?: T;
  /**
   * When true, the computation only runs when the `.value` property is
   * explicitly accessed by a subscriber.
   *
   * When to use:
   * - To optimize performance for expensive computations that are not
   *   always visible or required.
   */
  lazy?: boolean;
  /**
   * Error boundary for the computation logic. Prevents errors in the
   * formula from crashing the entire reactive propagation.
   */
  onError?: (error: Error) => void;
}

/**
 * A callback function to perform cleanup (e.g., unsubscribing from events)
 * before the next effect run or upon disposal.
 */
export type EffectCleanup = () => void;

/**
 * The execution logic for a reactive side-effect.
 *
 * @remarks
 * If the function returns a cleanup function, it will be executed:
 * 1. Immediately before the next time the effect is re-run.
 * 2. When the effect is manually disposed.
 *
 * @example
 * effect(() => {
 *   const timer = setInterval(() => console.log('tick'), 1000);
 *   return () => clearInterval(timer);
 * });
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required for TypeScript return type compatibility.
export type EffectFunction = () => (void | EffectCleanup) | Promise<void | EffectCleanup>;

/**
 * Configuration for controlling reactive side-effects.
 */
export interface EffectOptions {
  /** Identifier for diagnostics and performance profiling. */
  name?: string;
  /**
   * When true, the effect executes immediately upon creation rather
   * than waiting for the next microtask.
   */
  sync?: boolean;
  /**
   * Safety Break: The maximum number of executions permitted per second.
   *
   * Why: Prevents runaway effects from pegging the CPU if a tight
   * update loop is accidentally created.
   */
  maxExecutionsPerSecond?: number;
  /**
   * Safety Break: The maximum number of executions permitted per batch flush.
   *
   * Why: Detects and stops circular dependency loops before they cause
   * a stack overflow.
   */
  maxExecutionsPerFlush?: number;
  /**
   * Global error handler for both the effect execution and its
   * cleanup logic.
   */
  onError?: (error: unknown) => void;
}
