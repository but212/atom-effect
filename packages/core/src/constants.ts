/**
 * Internal bitmask flags used for state management within `ReactiveNode`.
 *
 * Logic: These flags are managed as a single 31-bit integer field to represent
 * the lifecycle and execution state of reactive primitives.
 *
 * Optimization: The use of a bitmask field ensures that state tracking is compatible
 * with V8 SMI (Small Integer) optimization, avoiding heap allocation and improving
 * performance during state transitions.
 *
 * Bit Layout:
 * - [0-7]   : Shared Core states (Disposed, Computed identity)
 * - [8-15]  : Computed-specific states (Dirty checking, recomputation)
 * - [16-23] : Asynchronous lifecycle states (Idle, Pending, Resolved, Rejected)
 * - [24-30] : Primitive-specific states (Atom sync, Effect execution)
 *
 * @internal
 */
const FLAGS = {
  // --- Shared Core (0-7) ---
  DISPOSED: 1 << 0,
  IS_COMPUTED: 1 << 1,

  // --- Computed Flags (8-15) ---
  DIRTY: 1 << 8,
  RECOMPUTING: 1 << 9,
  HAS_ERROR: 1 << 10,
  FORCE_COMPUTE: 1 << 11,

  // --- Async States (16-23) ---
  IDLE: 1 << 16,
  PENDING: 1 << 17,
  RESOLVED: 1 << 18,
  REJECTED: 1 << 19,

  // --- Atom Specific (24-27) ---
  ATOM_SYNC: 1 << 24,
  ATOM_NOTIFICATION_SCHEDULED: 1 << 25,

  // --- Effect Specific (28-30) ---
  EFFECT_EXECUTING: 1 << 28,
} as const;

/**
 * Compound bitmasks used for efficient multi-flag validation and resetting.
 *
 * When to use:
 * - To reset a group of related flags (e.g., clearing all dirty-related bits).
 * - To check if a node resides in any of the specified aggregate states.
 */
export const STATE_MASKS = Object.freeze({
  /** Bitmask covering all asynchronous lifecycle states. */
  ASYNC_STATE: FLAGS.IDLE | FLAGS.PENDING | FLAGS.RESOLVED | FLAGS.REJECTED,
  /** Bitmask covering all states that indicate a need for re-computation. */
  COMPUTED_DIRTY_MASK: FLAGS.DIRTY | FLAGS.RECOMPUTING | FLAGS.FORCE_COMPUTE,
});

/**
 * Enumeration of asynchronous operation states for public API consumption.
 *
 * When to use:
 * - To verify the current status of an asynchronous atom or computed node.
 *
 * @example
 * ```typescript
 * import { AsyncState } from '@but212/atom-effect';
 *
 * if (myAtom.status === AsyncState.PENDING) {
 *   renderLoadingIndicator();
 * }
 * ```
 */
export const AsyncState = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
});

/** @internal */
export const EFFECT_STATE_FLAGS = Object.freeze({
  DISPOSED: FLAGS.DISPOSED,
  EXECUTING: FLAGS.EFFECT_EXECUTING,
});

/** @internal */
export const COMPUTED_STATE_FLAGS = Object.freeze({
  DISPOSED: FLAGS.DISPOSED,
  IS_COMPUTED: FLAGS.IS_COMPUTED,
  DIRTY: FLAGS.DIRTY,
  IDLE: FLAGS.IDLE,
  PENDING: FLAGS.PENDING,
  RESOLVED: FLAGS.RESOLVED,
  REJECTED: FLAGS.REJECTED,
  RECOMPUTING: FLAGS.RECOMPUTING,
  HAS_ERROR: FLAGS.HAS_ERROR,
  FORCE_COMPUTE: FLAGS.FORCE_COMPUTE,
});

/** @internal */
export const ATOM_STATE_FLAGS = Object.freeze({
  DISPOSED: FLAGS.DISPOSED,
  SYNC: FLAGS.ATOM_SYNC,
  NOTIFICATION_SCHEDULED: FLAGS.ATOM_NOTIFICATION_SCHEDULED,
});

/**
 * Global configuration parameters for the Scheduler.
 *
 * Caution: Modification of these thresholds can significantly impact the stability
 * and memory footprint of the reactive engine.
 */
export const SCHEDULER_CONFIG = Object.freeze({
  /**
   * The maximum number of effect executions allowed per second as a loop protection measure.
   * Reason: Prevents runaway processes from freezing the host environment.
   */
  MAX_EXECUTIONS_PER_SECOND: 1000,
  /**
   * The maximum number of times a single effect can execute within a single microtask cycle.
   */
  MAX_EXECUTIONS_PER_EFFECT: 100,

  /**
   * The global execution limit for all tasks within a single flush cycle.
   */
  MAX_EXECUTIONS_PER_FLUSH: 10000,
  /**
   * The maximum number of drain iterations allowed per flush before an overflow is declared.
   */
  MAX_FLUSH_ITERATIONS: 1000,
  /**
   * The minimum number of iterations allowed for a flush cycle.
   */
  MIN_FLUSH_ITERATIONS: 10,

  /**
   * The threshold at which the batch queue array is shrunk to release unused memory.
   */
  BATCH_QUEUE_SHRINK_THRESHOLD: 1000,
});

/**
 * The maximum safe integer value for 32nd-bit signed systems in V8 (SMI).
 *
 * Optimization: Values within this range are stored directly in CPU registers
 * by V8, avoiding boxing and unboxing overhead.
 */
export const SMI_MAX = 0x3fffffff;

/**
 * Thresholds and toggles for development diagnostic features.
 */
export const DEBUG_CONFIG = Object.freeze({
  /** Enables or disables infinite loop warnings in the console. */
  WARN_INFINITE_LOOP: true,
  /** The time window (in ms) used for monitoring execution frequency. */
  EFFECT_FREQUENCY_WINDOW: 1000,
  /** The number of updates allowed within the time window before a warning is triggered. */
  LOOP_THRESHOLD: 100,
});

/** @internal */
export const COMPUTED_CONFIG = Object.freeze({
  /** Optimization: Restricts promise IDs to the SMI range to optimize comparison operations. */
  MAX_PROMISE_ID: SMI_MAX,
});

/**
 * Sentinel values used for tracking epoch-based state consistency.
 */
export const EPOCH_CONSTANTS = Object.freeze({
  /** Represents an uninitialized epoch, typically used as an initial state. */
  UNINITIALIZED: -1,
  /** The minimum valid epoch value assigned after a counter reset. */
  MIN: 1,
});

let runtimeDebug = false;
try {
  // Logic: Runtime debug state is derived from global environment overrides or session storage markers.
  runtimeDebug = !!(
    (typeof globalThis !== 'undefined' &&
      (globalThis as { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('__ATOM_DEBUG__') === 'true')
  );
} catch {
  // Suppress errors during environment feature detection.
}

/**
 * A flag indicating whether the library is running in a development environment.
 *
 * Logic: This constant is resolved by evaluating build-time environment variables
 * (`process.env.NODE_ENV`), bundler-injected globals (`__DEV__`), and runtime debug markers.
 */
export const IS_DEV =
  (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') ||
  (typeof __DEV__ !== 'undefined' && !!__DEV__) ||
  // @ts-expect-error: import.meta.env is environment-specific and may not be present in all contexts.
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) ||
  runtimeDebug;

// Fallback declarations for common build-time global variables.
declare const __DEV__: boolean;

/**
 * A reusable, frozen empty array used for memory optimization in settled error states.
 *
 * Constraint: This array must remain immutable to prevent side-effects in subscriber logic.
 */
export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);
