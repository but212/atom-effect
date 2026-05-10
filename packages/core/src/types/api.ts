/** Configuration for initializing an atom. */
export interface AtomOptions<T = unknown> {
  /** Identifier for debugger and devtools. */
  name?: string;
  /**
   * When true, updates bypass the scheduler and notify subscribers immediately.
   */
  sync?: boolean;
  /** Custom comparator to prevent unnecessary updates. */
  equal?: (a: T, b: T) => boolean;
}

/** Configuration for derived computed atoms. */
export interface ComputedOptions<T = unknown> {
  /** Identifier for debugging. */
  name?: string;
  /** Comparator to prune updates. */
  equal?: (a: T, b: T) => boolean;
  /** Value returned before the first computation completes. */
  defaultValue?: T;
  /** When true, computation only runs when the `.value` property is accessed. */
  lazy?: boolean;
  /** Error boundary for the computation logic. */
  onError?: (error: Error) => void;
}

/** Cleanup callback for effects. */
export type EffectCleanup = () => void;

/**
 * Execution logic for a reactive effect.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required for TypeScript return type compatibility.
export type EffectFunction = () => (void | EffectCleanup) | Promise<void | EffectCleanup>;

/** Configuration for reactive side-effects. */
export interface EffectOptions {
  /** Identifier for diagnostics. */
  name?: string;
  /** When true, runs immediately upon creation. */
  sync?: boolean;
  /** Reason: Protection against runaway recursive loops. */
  maxExecutionsPerSecond?: number;
  /** Reason: Protection against circular dependencies. */
  maxExecutionsPerFlush?: number;
  /** Error handler for the effect logic and its cleanup. */
  onError?: (error: unknown) => void;
}
