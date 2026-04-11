/**
 * Internal State Flags for ReactiveNode.
 *
 * Managed as a 31-bit integer field (V8 SMI optimization).
 *
 * Bit Layout:
 * [0-7]   - Shared Core (Disposed, Computed marker, etc.)
 * [8-15]  - Computed States (Dirty, Recomputing, etc.)
 * [16-23] - Async Lifecycle (Idle, Pending, Resolved, Rejected)
 * [24-30] - Primitive Specific (Atom Sync, Effect Executing, etc.)
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
 * Compound Masks for fast bitwise clearing/checking.
 */
export const STATE_MASKS = Object.freeze({
  /** Matches all bits related to async states (Idle, Pending, Resolved, Rejected). */
  ASYNC_STATE: FLAGS.IDLE | FLAGS.PENDING | FLAGS.RESOLVED | FLAGS.REJECTED,
  /** Matches all flags that indicate a computed node is dirty or recomputing. */
  COMPUTED_DIRTY_MASK: FLAGS.DIRTY | FLAGS.RECOMPUTING | FLAGS.FORCE_COMPUTE,
});

/**
 * Async operation states for public API and high-level checks.
 */
export const AsyncState = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
});

/**
 * Effect flags.
 */
export const EFFECT_STATE_FLAGS = Object.freeze({
  DISPOSED: FLAGS.DISPOSED,
  EXECUTING: FLAGS.EFFECT_EXECUTING,
});

/**
 * Computed flags.
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
 * Writable Atom Flags.
 */
export const ATOM_STATE_FLAGS = Object.freeze({
  DISPOSED: FLAGS.DISPOSED,
  SYNC: FLAGS.ATOM_SYNC,
  NOTIFICATION_SCHEDULED: FLAGS.ATOM_NOTIFICATION_SCHEDULED,
});

/**
 * Scheduler configuration.
 */
export const SCHEDULER_CONFIG = Object.freeze({
  // Infinite loop protection
  MAX_EXECUTIONS_PER_SECOND: 1000,
  MAX_EXECUTIONS_PER_EFFECT: 100,

  // Batch processing limits to prevent blocking the main thread for too long
  MAX_EXECUTIONS_PER_FLUSH: 10000,
  MAX_FLUSH_ITERATIONS: 1000,
  MIN_FLUSH_ITERATIONS: 10,

  // Memory management
  BATCH_QUEUE_SHRINK_THRESHOLD: 1000,
});

/**
 * V8 Small Integer (SMI) max value.
 */
export const SMI_MAX = 0x3fffffff;

/**
 * Debugging thresholds.
 */
export const DEBUG_CONFIG = Object.freeze({
  WARN_INFINITE_LOOP: true,
  EFFECT_FREQUENCY_WINDOW: 1000,
  LOOP_THRESHOLD: 100,
});

/**
 * Computed configuration.
 */
export const COMPUTED_CONFIG = Object.freeze({
  MAX_PROMISE_ID: SMI_MAX,
});

/**
 * Epoch sentinel values.
 */
export const EPOCH_CONSTANTS = Object.freeze({
  /** Uninitialized epoch marker. Used as initial value before any flush has occurred. */
  UNINITIALIZED: -1,
  /** Minimum valid epoch value after a counter reset. */
  MIN: 1,
});

let runtimeDebug = false;
try {
  runtimeDebug = !!(
    (typeof globalThis !== 'undefined' &&
      (globalThis as { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('__ATOM_DEBUG__') === 'true')
  );
} catch {}

/**
 * Development environment flag.
 */
export const IS_DEV =
  (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') ||
  (typeof __DEV__ !== 'undefined' && !!__DEV__) ||
  // @ts-expect-error: import.meta.env is Vite-specific and may not be defined in all environments
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) ||
  runtimeDebug;

// Fallback declarations for global environment variables
declare const __DEV__: boolean;

export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);
