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
 * Common bit flags for all reactive nodes (ReactiveNode)
 * Reserved lower bits for base class state
 */
export const NODE_FLAGS = {
  DISPOSED: 1 << 0,
  HAS_FN_SUBS: 1 << 1,
  HAS_OBJ_SUBS: 1 << 2,
} as const;

/**
 * Bit flags for effect state management
 * Using bit flags for efficient state checks (O(1) operations)
 */
export const EFFECT_STATE_FLAGS = {
  ...NODE_FLAGS,
  EXECUTING: 1 << 3,
} as const;

/**
 * Bit flags for computed atom state management
 * Enables fast state transitions and checks without multiple boolean fields
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
 * Bit flags for atom state management
 */
export const ATOM_STATE_FLAGS = {
  ...NODE_FLAGS,
  SYNC: 1 << 3,
  NOTIFICATION_SCHEDULED: 1 << 4,
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
  MAX_EXECUTIONS_PER_SECOND: 1000,
  /** Threshold for cleaning up old execution timestamps */
  CLEANUP_THRESHOLD: 1000,

  /**
   * Maximum executions per effect within a single flush cycle
   * Increased from 50 to 100
   */
  MAX_EXECUTIONS_PER_EFFECT: 100,

  /**
   * Maximum total executions across all effects in a single flush cycle
   * Increased from 5000 to 10000
   */
  MAX_EXECUTIONS_PER_FLUSH: 10000,

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
 * Phase-Shift Versioning Constants
 *
 * Implements discrete phase rotation for version management.
 * Inspired by imaginary number rotation (e^iθ) for cyclic state tracking.
 *
 * Version Structure (30 bits total, fits in V8 Smi):
 * - Cycle (upper 10 bits): Complete rotation count (0-1023)
 * - Phase (lower 20 bits): Current angle in discrete steps (0-1,048,575)
 *
 * Operations:
 * - rotatePhase: (version + 1) & 0x3fffffff
 * - getShift: (current - cached) & 0x3fffffff
 * - urgentPriority: ((PHASE_THRESHOLD - 1 - shift) >>> 31) & 1
 */
export const PHASE_BITS = 20;
export const PHASE_MASK = (1 << PHASE_BITS) - 1; // 0x000fffff (1,048,575)

/**
 * Phase threshold for urgent scheduling (equivalent to 180° rotation)
 * When shift exceeds this value, the job is considered "urgent"
 * and placed in the priority queue for glitch reduction.
 */
export const PHASE_THRESHOLD = 1 << (PHASE_BITS - 1); // 524,288

/**
 * Environment detection
 */
export const IS_DEV =
  typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';

/**
 * Empty frozen error array constant to avoid allocations
 * Used for computed atoms with no errors (the common case)
 */
export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);
