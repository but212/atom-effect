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
 * Unified Reactive Node Flags (31-bit SMI safe)
 */
export const NODE_FLAGS = {
  // --- Common Flags (0-3) ---
  DISPOSED: 1 << 0, // All
  IS_COMPUTED: 1 << 1, // Marker for Computeds
  IS_EFFECT: 1 << 2, // Marker for Effects
  EXECUTING: 1 << 3, // Computed (Recomputing) & Effect (Executing)

  // --- Atom Specific (4-5) ---
  ATOM_SYNC: 1 << 4,
  ATOM_NOTIFY_PENDING: 1 << 5,

  // --- Computed Specific (6-13) ---
  COMPUTED_DIRTY: 1 << 6,
  COMPUTED_IDLE: 1 << 7,
  COMPUTED_PENDING: 1 << 8,
  COMPUTED_RESOLVED: 1 << 9,
  COMPUTED_REJECTED: 1 << 10,
  COMPUTED_HAS_ERROR: 1 << 11,
  COMPUTED_FORCE_CHECK: 1 << 12, // For explicit invalidation
} as const;

/**
 * Effect flags (Legacy compatibility & semantic aliasing)
 */
export const EFFECT_STATE_FLAGS = {
  DISPOSED: NODE_FLAGS.DISPOSED,
  EXECUTING: NODE_FLAGS.EXECUTING,
} as const;

/**
 * Computed flags (Legacy compatibility & semantic aliasing)
 */
export const COMPUTED_STATE_FLAGS = {
  DISPOSED: NODE_FLAGS.DISPOSED,
  IS_COMPUTED: NODE_FLAGS.IS_COMPUTED,
  DIRTY: NODE_FLAGS.COMPUTED_DIRTY,
  IDLE: NODE_FLAGS.COMPUTED_IDLE,
  PENDING: NODE_FLAGS.COMPUTED_PENDING,
  RESOLVED: NODE_FLAGS.COMPUTED_RESOLVED,
  REJECTED: NODE_FLAGS.COMPUTED_REJECTED,
  RECOMPUTING: NODE_FLAGS.EXECUTING,
  HAS_ERROR: NODE_FLAGS.COMPUTED_HAS_ERROR,
  FORCE_COMPUTE: NODE_FLAGS.COMPUTED_FORCE_CHECK,
} as const;

/**
 * Writable Atom Flags (Legacy compatibility & semantic aliasing)
 */
export const ATOM_STATE_FLAGS = {
  DISPOSED: NODE_FLAGS.DISPOSED,
  SYNC: NODE_FLAGS.ATOM_SYNC,
  NOTIFICATION_SCHEDULED: NODE_FLAGS.ATOM_NOTIFY_PENDING,
} as const;

/**
 * Pre-calculated bitmasks for high-performance hot paths.
 */
export const NODE_MASKS = {
  // --- Atom ---
  // Guard for _flushNotifications: Pending && !Disposed
  ATOM_FLUSH_GUARD: NODE_FLAGS.ATOM_NOTIFY_PENDING | NODE_FLAGS.DISPOSED,

  // --- Computed ---
  // Access check: Stable (Resolved && !Dirty && !Idle)
  COMPUTED_STABLE:
    NODE_FLAGS.COMPUTED_RESOLVED | NODE_FLAGS.COMPUTED_DIRTY | NODE_FLAGS.COMPUTED_IDLE,

  // State transitions: Clear specific groups before setting new state
  COMPUTED_PENDING_RESET:
    NODE_FLAGS.COMPUTED_IDLE |
    NODE_FLAGS.COMPUTED_DIRTY |
    NODE_FLAGS.COMPUTED_RESOLVED |
    NODE_FLAGS.COMPUTED_REJECTED,

  COMPUTED_ERROR_RESET:
    NODE_FLAGS.COMPUTED_IDLE |
    NODE_FLAGS.COMPUTED_DIRTY |
    NODE_FLAGS.COMPUTED_PENDING |
    NODE_FLAGS.COMPUTED_RESOLVED,

  COMPUTED_RESOLVED_RESET:
    NODE_FLAGS.COMPUTED_IDLE |
    NODE_FLAGS.COMPUTED_DIRTY |
    NODE_FLAGS.COMPUTED_PENDING |
    NODE_FLAGS.COMPUTED_REJECTED |
    NODE_FLAGS.COMPUTED_HAS_ERROR,
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
