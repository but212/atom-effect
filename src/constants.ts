/**
 * @fileoverview Constants and configuration for atom-effect library
 * @description Centralized constants for async states, bit flags, and performance tuning
 */

/**
 * Async computation states for computed atoms
 */
export const AsyncState = {
  IDLE: 'idle' as const,
  PENDING: 'pending' as const,
  RESOLVED: 'resolved' as const,
  REJECTED: 'rejected' as const,
};

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
  /** Maximum effect executions per second to detect infinite loops */
  MAX_EXECUTIONS_PER_SECOND: 100,
  /** Threshold for cleaning up old execution timestamps */
  CLEANUP_THRESHOLD: 100,
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
