/**
 * Logic: Bitspace Partitioning
 * Defines the starting bit index for different node types and states.
 * @internal
 */
const OFFSET = {
  CORE: 0,
  COMPUTED: 8,
  ASYNC: 16,
  PRIMITIVE: 24,
} as const satisfies Record<string, number>;

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
} as const satisfies Record<string, number>;

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
  /** Covers asynchronous states that have not yet produced a final value. */
  ASYNC_UNRESOLVED_MASK: FLAGS.PENDING | FLAGS.REJECTED,
  /** Pattern of flags that trigger an immediate re-computation on access. */
  COMPUTED_RECOMPUTE_NEEDED_MASK: FLAGS.IDLE | FLAGS.FORCE_COMPUTE,
  /** Covers states indicating an error occurred during computation. */
  ERROR_MASK: FLAGS.REJECTED | FLAGS.HAS_ERROR,
  /** Covers all primary lifecycle states. */
  LIFECYCLE_MASK:
    FLAGS.IDLE | FLAGS.DIRTY | FLAGS.PENDING | FLAGS.RESOLVED | FLAGS.REJECTED | FLAGS.HAS_ERROR,
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
