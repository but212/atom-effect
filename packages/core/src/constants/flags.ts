/**
 * @module BitfieldEngine
 *
 * Responsibility:
 * This module defines the low-level bitfield architecture used by all `ReactiveNode`
 * instances.
 *
 * Design Intent:
 * By using bitwise flags instead of boolean properties, we store the entire
 * lifecycle and capability state of a node in a single 31-bit integer. This
 * drastically reduces heap memory per node and enables high-speed batch
 * validations using bitmasking.
 */

/**
 * Bitspace partitioning offsets.
 *
 * Why: Offsets organize the 32-bit space into logical segments to prevent
 * flag collisions between different node types (Atom vs. Effect) and states.
 *
 * @internal
 */
const OFFSET = {
  CORE: 0,
  COMPUTED: 8,
  ASYNC: 16,
  PRIMITIVE: 24,
} as const satisfies Record<string, number>;

/**
 * Individual bitmask flags for internal state management.
 *
 * Logic: State Representation
 * Each state occupies exactly one bit. This allows for compound state
 * transitions (e.g., clearing DIRTY while setting RECOMPUTING) in a single
 * atomic operation using bitwise operators.
 *
 * @internal
 */
const FLAGS = {
  // Shared Core (Bits 0-7): Fundamental lifecycle flags
  DISPOSED: 1 << (OFFSET.CORE + 0),
  IS_COMPUTED: 1 << (OFFSET.CORE + 1),

  // Computed Flags (Bits 8-15): Dependency and derivation state
  DIRTY: 1 << (OFFSET.COMPUTED + 0),
  RECOMPUTING: 1 << (OFFSET.COMPUTED + 1),
  HAS_ERROR: 1 << (OFFSET.COMPUTED + 2),
  FORCE_COMPUTE: 1 << (OFFSET.COMPUTED + 3),

  // Async States (Bits 16-23): Asynchronous lifecycle tracking
  IDLE: 1 << (OFFSET.ASYNC + 0),
  PENDING: 1 << (OFFSET.ASYNC + 1),
  RESOLVED: 1 << (OFFSET.ASYNC + 2),
  REJECTED: 1 << (OFFSET.ASYNC + 3),

  // Atom Specific (Bits 24-27): State source characteristics
  ATOM_SYNC: 1 << (OFFSET.PRIMITIVE + 0),
  ATOM_NOTIFICATION_SCHEDULED: 1 << (OFFSET.PRIMITIVE + 1),

  // Effect Specific (Bits 28-30): Subscription execution state
  EFFECT_EXECUTING: 1 << (OFFSET.PRIMITIVE + 4),
} as const satisfies Record<string, number>;

/**
 * Compound bitmasks for high-performance validation.
 *
 * Optimization: Bulk Validation
 * These masks allow the engine to verify complex conditions (e.g., "is the
 * node in any async state?") using a single bitwise comparison instead of
 * multiple logical branches.
 *
 * @internal
 */
export const STATE_MASKS = Object.freeze({
  /** Captures all possible asynchronous states. */
  ASYNC_STATE: FLAGS.IDLE | FLAGS.PENDING | FLAGS.RESOLVED | FLAGS.REJECTED,
  /** Captures all conditions that signify a stale or dirty value. */
  COMPUTED_DIRTY_MASK: FLAGS.DIRTY | FLAGS.RECOMPUTING | FLAGS.FORCE_COMPUTE,
  /** Captures async states that represent an ongoing or failed operation. */
  ASYNC_UNRESOLVED_MASK: FLAGS.PENDING | FLAGS.REJECTED,
  /** Condition pattern that triggers an immediate computation upon node access. */
  COMPUTED_RECOMPUTE_NEEDED_MASK: FLAGS.IDLE | FLAGS.FORCE_COMPUTE,
  /** Captures both synchronous and asynchronous error states. */
  ERROR_MASK: FLAGS.REJECTED | FLAGS.HAS_ERROR,
  /** Captures the primary reactive lifecycle states. */
  LIFECYCLE_MASK:
    FLAGS.IDLE | FLAGS.DIRTY | FLAGS.PENDING | FLAGS.RESOLVED | FLAGS.REJECTED | FLAGS.HAS_ERROR,
});

/**
 * Logic: Shared State Interface
 * Defines the public-facing flag contract for Effect nodes.
 * @internal
 */
export const EFFECT_STATE_FLAGS = Object.freeze({
  DISPOSED: FLAGS.DISPOSED,
  EXECUTING: FLAGS.EFFECT_EXECUTING,
});

/**
 * Logic: Shared State Interface
 * Defines the public-facing flag contract for Computed nodes.
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
 * Defines the public-facing flag contract for Atom nodes.
 * @internal
 */
export const ATOM_STATE_FLAGS = Object.freeze({
  DISPOSED: FLAGS.DISPOSED,
  SYNC: FLAGS.ATOM_SYNC,
  NOTIFICATION_SCHEDULED: FLAGS.ATOM_NOTIFICATION_SCHEDULED,
});
