/**
 * Time-related constants (in milliseconds)
 */
export const TIME_CONSTANTS = {
  /** One second in milliseconds */
  ONE_SECOND_MS: 1000,
} as const;

/**
 * Async computation states for computed atoms
 */
export const AsyncState = {
  IDLE: 'idle' as const,
  PENDING: 'pending' as const,
  RESOLVED: 'resolved' as const,
  REJECTED: 'rejected' as const,
} as const;

/**
 * Bit flags for effect state management
 * Using bit flags for efficient state checks (O(1) operations)
 */
export const EFFECT_STATE_FLAGS = {
  DISPOSED: 1 << 0, // 0001 - Effect has been disposed
  EXECUTING: 1 << 1, // 0010 - Effect is currently executing
} as const;

/**
 * Bit flags for computed atom state management
 * Enables fast state transitions and checks without multiple boolean fields
 */
export const COMPUTED_STATE_FLAGS = {
  DIRTY: 1 << 0, // 0001 - Needs recomputation
  IDLE: 1 << 1, // 0010 - Initial state, not computed yet
  PENDING: 1 << 2, // 0100 - Async computation in progress
  RESOLVED: 1 << 3, // 1000 - Successfully computed
  REJECTED: 1 << 4, // 10000 - Computation failed
  RECOMPUTING: 1 << 5, // 100000 - Currently recomputing
  HAS_ERROR: 1 << 6, // 1000000 - Has error state
} as const;

/**
 * Object pool configuration
 * Controls memory management and GC pressure reduction
 */
export const POOL_CONFIG = {
  /** Maximum number of pooled objects to prevent memory bloat */
  MAX_SIZE: 1000,
  /** Number of objects to pre-allocate for performance-critical paths */
  WARMUP_SIZE: 100,
} as const;

/**
 * Scheduler configuration
 * Controls batching behavior and performance limits
 */
export const SCHEDULER_CONFIG = {
  /** Maximum effect executions per second to detect infinite loops (Legacy/Fallback) */
  MAX_EXECUTIONS_PER_SECOND: 100,
  /** Threshold for cleaning up old execution timestamps */
  CLEANUP_THRESHOLD: 100,

  /**
   * Maximum executions per effect within a single flush cycle
   * Increased from 10 to 50 based on evaluation report
   */
  MAX_EXECUTIONS_PER_EFFECT: 50,

  /**
   * Maximum total executions across all effects in a single flush cycle
   * Increased from 1000 to 5000 based on evaluation report
   */
  MAX_EXECUTIONS_PER_FLUSH: 5000,

  /** Maximum iterations for synchronous flush loop to prevent infinite loops */
  MAX_FLUSH_ITERATIONS: 1000,

  /** Minimum allowed value for max flush iterations */
  MIN_FLUSH_ITERATIONS: 10,
} as const;

/**
 * Debug configuration defaults
 */
export const DEBUG_CONFIG = {
  /** Maximum dependencies before warning about large dependency graphs */
  MAX_DEPENDENCIES: 1000,
  /** Enable infinite loop detection warnings */
  WARN_INFINITE_LOOP: true,
} as const;

/**
 * Maximum Small Integer (Smi) value in V8 (31-bit signed integer)
 * Used for IDs and Versions to prevent HeapNumber allocation
 */
export const SMI_MAX = 0x3fffffff;

/**
 * Environment detection
 */
export const IS_DEV =
  typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';
