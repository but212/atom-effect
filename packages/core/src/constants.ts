/**
 * Global time constants.
 * Used for debouncing, throttling, and scheduling.
 */
export const TIME_CONSTANTS = {
  ONE_SECOND_MS: 1000,
} as const;

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
 * Base Node Flags.
 */
export const NODE_FLAGS = {
  DISPOSED: 1 << 0,
} as const;

/**
 * Effect flags.
 */
export const EFFECT_STATE_FLAGS = {
  ...NODE_FLAGS,
  EXECUTING: 1 << 3,
} as const;

/**
 * Computed flags.
 */
export const COMPUTED_STATE_FLAGS = {
  ...NODE_FLAGS,
  DIRTY: 1 << 3,
  IDLE: 1 << 4,
  PENDING: 1 << 5,
  RESOLVED: 1 << 6,
  REJECTED: 1 << 7,
  RECOMPUTING: 1 << 8,
  HAS_ERROR: 1 << 9,
} as const;

/**
 * Writable Atom Flags.
 */
export const ATOM_STATE_FLAGS = {
  ...NODE_FLAGS,
  SYNC: 1 << 3,
  NOTIFICATION_SCHEDULED: 1 << 4,
} as const;

/**
 * Array pool configuration.
 */
export const POOL_CONFIG = {
  MAX_SIZE: 1000,
  WARMUP_SIZE: 100,
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
  CLEANUP_THRESHOLD: 1000,
  BATCH_QUEUE_SHRINK_THRESHOLD: 1000,
} as const;

/**
 * Debugging thresholds.
 */
export const DEBUG_CONFIG = {
  MAX_DEPENDENCIES: 1000,
  WARN_INFINITE_LOOP: true,
} as const;

/**
 * V8 Small Integer (SMI) max value.
 */
export const SMI_MAX = 0x3fffffff;

/**
 * Development environment flag.
 */
export const IS_DEV =
  (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') ||
  (typeof __DEV__ !== 'undefined' && !!__DEV__);

// Fallback declaration for __DEV__ if not present in environment
declare const __DEV__: boolean;

export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);
