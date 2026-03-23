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
 * Effect flags.
 */
export const EFFECT_STATE_FLAGS = {
  DISPOSED: 1 << 0,
  EXECUTING: 1 << 3,
} as const;

/**
 * Computed flags.
 */
export const COMPUTED_STATE_FLAGS = {
  DISPOSED: 1 << 0,
  /** Marker bit: identifies this node as a computed. */
  IS_COMPUTED: 1 << 1,
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
  DISPOSED: 1 << 0,
  SYNC: 1 << 3,
  NOTIFICATION_SCHEDULED: 1 << 4,
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
  MAX_ASYNC_RETRIES: 3,
  MAX_PROMISE_ID: Number.MAX_SAFE_INTEGER - 1,
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
 * Bit-packing constants for versioned slot operations.
 * Used by DepSlotBuffer for O(1) snapshot hashing.
 */
export const BITPACK = {
  /** Bits allocated for version in a packed slot value. */
  VERSION_BITS: 16,
  /** Mask to extract the lower 16 bits (node ID / value). */
  LO_MASK: 0xffff,
  /** Maximum value representable in 16 bits. */
  MAX_16: 0xffff,
} as const;

/**
 * Development environment flag.
 */
export const IS_DEV =
  (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') ||
  (typeof __DEV__ !== 'undefined' && !!__DEV__);

// Fallback declaration for __DEV__ if not present in environment
declare const __DEV__: boolean;

export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);
