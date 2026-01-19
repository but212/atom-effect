import type { Dependency } from './common';

/**
 * Internal context used during effect execution to track dependency changes.
 * Bundles prev/next state for atomic lifecycle transitions.
 */
export interface EffectExecutionContext {
  prevDeps: Dependency[];
  prevVersions: number[];
  prevUnsubs: (() => void)[];
  nextDeps: Dependency[];
  nextVersions: number[];
  nextUnsubs: (() => void)[];
}

/** Configuration options for creating an effect. */
export interface EffectOptions {
  /** If true, the effect runs synchronously whenever its dependencies change. */
  sync?: boolean;
  /** Maximum number of executions allowed per second for rate limiting. */
  maxExecutionsPerSecond?: number;
  /** Maximum number of executions allowed per scheduler flush for loop detection. */
  maxExecutionsPerFlush?: number;
  /** If true, enables detection and warning for effects that modify their own dependencies. */
  trackModifications?: boolean;
  /** Callback function called when an execution error occurs (including async rejections). */
  onError?: (error: unknown) => void;
}

/** Represents a running effect instance. */
export interface EffectObject {
  /** Stops the effect and unsubscribes from all dependencies. */
  dispose(): void;
  /** Manually triggers an execution of the effect. */
  run(): void;
  /** true if the effect has been disposed. */
  readonly isDisposed: boolean;
  /** Number of times the effect has executed. */
  readonly executionCount: number;
}

/**
 * A function to be executed by an effect.
 * Can optionally return a cleanup function or a Promise that resolves to one.
 */
export type EffectFunction = () => void | (() => void) | Promise<undefined | (() => void)>;
