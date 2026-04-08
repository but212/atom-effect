/**
 * Async operation states.
 */
export const AsyncState = {
  IDLE: 'idle',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} as const;

/**
 * Common flags shared by all reactive nodes.
 */
export const COMMON_STATE_FLAGS = {
  DISPOSED: 1 << 0,
  /** Marker bit for computed atoms. */
  IS_COMPUTED: 1 << 1,
  /** Marker bit for effects. */
  IS_EFFECT: 1 << 2,
  /** Marker bit for base atoms. */
  IS_ATOM: 1 << 3,
} as const;

/**
 * Effect-specific flags.
 */
export const EFFECT_STATE_FLAGS = {
  ...COMMON_STATE_FLAGS,
  /** Multi-use slot for active/executing state. */
  EXECUTING: 1 << 4,
} as const;

/**
 * Computed-specific flags.
 */
export const COMPUTED_STATE_FLAGS = {
  ...COMMON_STATE_FLAGS,
  /** Node is dirty and needs re-computation. */
  DIRTY: 1 << 4,

  // Evaluation States
  IDLE: 1 << 5,
  PENDING: 1 << 6,
  RESOLVED: 1 << 7,
  REJECTED: 1 << 8,

  // Reification Status
  RECOMPUTING: 1 << 9,
  HAS_ERROR: 1 << 10,
  FORCE_COMPUTE: 1 << 11,
} as const;

/**
 * Writable Atom Flags.
 */
export const ATOM_STATE_FLAGS = {
  ...COMMON_STATE_FLAGS,
  /** Notifier strategy. */
  SYNC: 1 << 4,
  /** Scheduler status. */
  NOTIFICATION_SCHEDULED: 1 << 5,
} as const;

/**
 * Scheduler configuration.
 */
export const SCHEDULER_CONFIG = {
  // Infinite loop protection
  MAX_EXECUTIONS_PER_SECOND: 1000,
  MAX_EXECUTIONS_PER_EFFECT: 100,

  // Batch processing limits to prevent blocking the main thread for too long
  MAX_EXECUTIONS_PER_FLUSH: 10000,
  MAX_FLUSH_ITERATIONS: 1000,
  MIN_FLUSH_ITERATIONS: 10,

  // Memory management
  BATCH_QUEUE_SHRINK_THRESHOLD: 1000,
} as const;

/**
 * Debugging thresholds.
 */
export const DEBUG_CONFIG = {
  WARN_INFINITE_LOOP: true,
  EFFECT_FREQUENCY_WINDOW: 1000,
} as const;

/**
 * Computed configuration.
 */
export const COMPUTED_CONFIG = {
  /** SMI-safe promise counter limit. */
  MAX_PROMISE_ID: 0x3fffffff,
} as const;

/**
 * Epoch sentinel values.
 */
export const EPOCH_CONSTANTS = {
  /** Uninitialized epoch marker. Used as initial value before any flush has occurred. */
  UNINITIALIZED: -1,
  /** Minimum valid epoch value after a counter reset. */
  MIN: 1,
} as const;

/**
 * V8 Small Integer (SMI) max value.
 */
export const SMI_MAX = 0x3fffffff;

/**
 * Development environment flag.
 */
export const IS_DEV =
  (typeof process !== 'undefined' &&
    process.env &&
    (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production')) ||
  (typeof __DEV__ !== 'undefined' && !!__DEV__);

// Fallback declaration for __DEV__ if not present in environment
declare const __DEV__: boolean;

export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);
