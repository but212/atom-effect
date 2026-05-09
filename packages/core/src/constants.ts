/**
 * Logic: Bitspace Partitioning
 * Defines the starting bit index for different node types and states.
 */
const OFFSET = {
  CORE: 0,
  COMPUTED: 8,
  ASYNC: 16,
  PRIMITIVE: 24,
} as const;

/**
 * Internal bitmask flags for `ReactiveNode` state management.
 *
 * Logic: State Representation
 * Uses a single bit per state to allow for compound checks via bitwise OR (|)
 * and state transitions via bitwise XOR (^) or AND NOT (& ~).
 *
 * @internal
 */
const FLAGS = {
  // Shared Core (0-7)
  DISPOSED: 1 << (OFFSET.CORE + 0),
  IS_COMPUTED: 1 << (OFFSET.CORE + 1),

  // Computed Flags (8-15)
  DIRTY: 1 << (OFFSET.COMPUTED + 0),
  RECOMPUTING: 1 << (OFFSET.COMPUTED + 1),
  HAS_ERROR: 1 << (OFFSET.COMPUTED + 2),
  FORCE_COMPUTE: 1 << (OFFSET.COMPUTED + 3),

  // Async States (16-23)
  IDLE: 1 << (OFFSET.ASYNC + 0),
  PENDING: 1 << (OFFSET.ASYNC + 1),
  RESOLVED: 1 << (OFFSET.ASYNC + 2),
  REJECTED: 1 << (OFFSET.ASYNC + 3),

  // Atom Specific (24-27)
  ATOM_SYNC: 1 << (OFFSET.PRIMITIVE + 0),
  ATOM_NOTIFICATION_SCHEDULED: 1 << (OFFSET.PRIMITIVE + 1),

  // Effect Specific (28-30)
  EFFECT_EXECUTING: 1 << (OFFSET.PRIMITIVE + 4),
} as const;

/**
 * Compound bitmasks for multi-state validation and bulk resets.
 *
 * Optimization: Bulk Validation
 * Using compound masks reduces the number of bitwise comparisons in hot paths
 * (e.g., checking if a node is in any async state).
 *
 * @internal
 */
export const STATE_MASKS = Object.freeze({
  /** Covers all asynchronous lifecycle states. */
  ASYNC_STATE: FLAGS.IDLE | FLAGS.PENDING | FLAGS.RESOLVED | FLAGS.REJECTED,
  /** Covers all states indicating a requirement for re-computation. */
  COMPUTED_DIRTY_MASK: FLAGS.DIRTY | FLAGS.RECOMPUTING | FLAGS.FORCE_COMPUTE,
});

/**
 * Asynchronous operation states for public API consumption.
 *
 * When to use:
 * - To verify or branch logic based on the status of an asynchronous atom or computed node.
 *
 * @example
 * ```typescript
 * import { AsyncState } from '@but212/atom-effect';
 *
 * if (userProfile.status === AsyncState.PENDING) {
 *   showSpinner();
 * }
 * ```
 */
export const AsyncState = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
});

/**
 * Logic: Shared State Interface
 * Defines the bitmask contract for Effect-type nodes.
 * @internal
 */
export const EFFECT_STATE_FLAGS = Object.freeze({
  DISPOSED: FLAGS.DISPOSED,
  EXECUTING: FLAGS.EFFECT_EXECUTING,
});

/**
 * Logic: Shared State Interface
 * Defines the bitmask contract for Computed-type nodes.
 * @internal
 */
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

/**
 * Logic: Shared State Interface
 * Defines the bitmask contract for Atom-type nodes.
 * @internal
 */
export const ATOM_STATE_FLAGS = Object.freeze({
  DISPOSED: FLAGS.DISPOSED,
  SYNC: FLAGS.ATOM_SYNC,
  NOTIFICATION_SCHEDULED: FLAGS.ATOM_NOTIFICATION_SCHEDULED,
});

/**
 * Global configuration parameters for the Scheduler.
 *
 * Caution: Modification of these thresholds can lead to instability,
 * memory leaks, or execution overflows in complex dependency graphs.
 */
export const SCHEDULER_CONFIG = Object.freeze({
  /**
   * Reason: Prevents infinite loops or runaway effects from freezing the main thread.
   */
  MAX_EXECUTIONS_PER_SECOND: 1000,
  /**
   * Reason: Detects and stops circular dependencies within a single microtask.
   */
  MAX_EXECUTIONS_PER_EFFECT: 100,

  /**
   * Reason: Limits the total workload per flush to maintain frame-rate stability.
   */
  MAX_EXECUTIONS_PER_FLUSH: 10000,
  /**
   * Reason: Safety break for the drain-loop to prevent stack overflows or infinite flushing.
   */
  MAX_FLUSH_ITERATIONS: 1000,
  /**
   * Optimization: Batching
   * Ensures a minimum number of iterations are processed to allow for nested batched updates.
   */
  MIN_FLUSH_ITERATIONS: 10,

  /**
   * Optimization: Memory Pressure
   * Threshold for shrinking the internal batch queue to release memory back to the heap.
   */
  BATCH_QUEUE_SHRINK_THRESHOLD: 1000,
});

/**
 * Optimization: V8 SMI (Small Integer) Limit
 *
 * Values within this range (up to 30-bit signed) are stored directly in CPU registers
 * by V8, bypassing heap allocation and boxing overhead.
 *
 * @internal
 */
export const SMI_MAX = 0x3fffffff;

/**
 * Thresholds for development-time diagnostics.
 * @internal
 */
export const DEBUG_CONFIG = Object.freeze({
  /** Enables console warnings when potential infinite loops are detected. */
  WARN_INFINITE_LOOP: true,
  /** The time window (ms) for monitoring update frequency. */
  EFFECT_FREQUENCY_WINDOW: 1000,
  /** The update count limit before triggering a loop warning. */
  LOOP_THRESHOLD: 100,
});

/**
 * Sentinel values for epoch-based staleness tracking.
 *
 * Logic: Drift Detection
 * Epochs are used to determine if a dependency has changed since the last
 * computation without needing deep comparison.
 *
 * @internal
 */
export const EPOCH_CONSTANTS = Object.freeze({
  /** Initial state indicating no computation has occurred. */
  UNINITIALIZED: -1,
  /** Reset floor for epoch counters to avoid 0/falsy confusion. */
  MIN: 1,
});

/**
 * Logic: Runtime Debug Override
 * Checks for explicit debug flags in the global environment or session storage.
 */
const getRuntimeDebug = (): boolean => {
  try {
    return !!(
      (typeof globalThis !== 'undefined' &&
        (globalThis as unknown as { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__) ||
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('__ATOM_DEBUG__') === 'true')
    );
  } catch {
    return false;
  }
};

/**
 * Logic: Environment Metadata
 * Heuristic detection of bundler-injected development environment flags.
 */
const getImportMetaDev = (): boolean => {
  try {
    return !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  } catch {
    return false;
  }
};

/**
 * Logic: Multi-Environment Resolution
 * Aggregates signals from Node.js, Vite/Web-pack, ESM, and manual runtime overrides.
 */
const DEV_SIGNALS = {
  node: typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production',
  bundler: typeof __DEV__ !== 'undefined' && !!__DEV__,
  esm: typeof process === 'undefined' && getImportMetaDev(),
  runtime: getRuntimeDebug(),
} as const;

/**
 * Indicates if the library is running in a development environment.
 * When true, additional validation, diagnostic warnings, and loop protections are active.
 */
export const IS_DEV =
  DEV_SIGNALS.node || DEV_SIGNALS.bundler || DEV_SIGNALS.esm || DEV_SIGNALS.runtime;

declare const __DEV__: boolean;

/**
 * Optimization: Shared Immutable Empty State
 *
 * Constraint: Must remain immutable to prevent memory leaks and unexpected
 * side-effects in subscriber logic that expects an array structure.
 *
 * @internal
 */
export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);
