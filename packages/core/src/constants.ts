/**
 * @module Constants
 *
 * Responsibility:
 * Centralized high-performance registry for all branding symbols, environment
 * configurations, bitwise state flags, and scheduler thresholds used by the engine.
 *
 * Design Intent:
 * Consolidates configuration variables and low-level reactive flags into a single,
 * flat namespace. This co-location simplifies module dependencies, improves hot-path
 * bitwise performance, and reduces V8 engine de-optimization vectors.
 */

import type { SchedulerConfig } from './types';

/**
 * The unique symbol representing the branding metadata property on all reactive primitives.
 *
 * When to use:
 * - When verifying if a generic object or function is an internally managed reactive node.
 * - When performing low-level type introspection on the hot path.
 *
 * @example
 * ```typescript
 * import { BRAND } from '@but212/atom-effect';
 *
 * const isBranded = (obj: any): boolean => obj !== null && typeof obj === 'object' && BRAND in obj;
 * ```
 */
export const BRAND = Symbol.for('atom-effect/brand');

/**
 * Bitwise capability and type markers for reactive nodes.
 *
 * When to use:
 * - When implementing custom type-guards or diagnostic tools to check specific node properties.
 * - When parsing capability states from the `BRAND` metadata property.
 *
 * @example
 * ```typescript
 * import { BRAND, BrandFlags } from '@but212/atom-effect';
 *
 * const brand = (node as any)[BRAND];
 * const isWritableAtom = !!(brand & BrandFlags.Writable);
 * ```
 */
export const BrandFlags = {
  Atom: 1 << 0,
  Writable: 1 << 1,
  Computed: 1 << 2,
  Effect: 1 << 3,
  Lens: 1 << 4,
} as const;

/**
 * @internal
 * Constraint: Mask for isolating core type bits (Atom, Computed, Effect).
 */
export const BRAND_MASK = BrandFlags.Atom | BrandFlags.Computed | BrandFlags.Effect;

/**
 * @internal
 * Role: Map for resolving human-readable type identities from brand bitmasks.
 */
export const BRAND_IDENTITY_MAP = {
  [BrandFlags.Atom]: { type: 'atom', prefix: 'atom_' },
  [BrandFlags.Atom | BrandFlags.Computed]: { type: 'computed', prefix: 'calc_' },
  [BrandFlags.Effect]: { type: 'effect', prefix: 'fx_' },
} as const;

/**
 * @internal
 * Optimization: Differentiates between function-based and object-based subscribers.
 * Avoids expensive `typeof` or `instanceof` checks on the propagation hot path.
 */
export const KIND = {
  Fn: 0,
  Obj: 1,
} as const;

/**
 * States representing the execution phase of asynchronous reactive nodes.
 *
 * When to use:
 * - When implementing UI branchings or spinner states dependent on an async node's evaluation.
 * - When querying the status of a pending computed source.
 *
 * @example
 * ```typescript
 * import { AsyncState } from '@but212/atom-effect';
 *
 * if (userComputed.status === AsyncState.PENDING) {
 *   showSpinner();
 * }
 * ```
 */
export const AsyncState = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} as const);

/**
 * @internal
 * Optimization: Shared empty error array to minimize Garbage Collector pressure.
 * Avoids allocating new empty arrays when nodes evaluate successfully.
 */
export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);

/**
 * @internal
 * Role: Standardized prefix for console warnings and thrown exception messages.
 */
export const LOG_PREFIX = '[atom-effect]';

/**
 * @internal
 * Role: Standardized prefix for development-only diagnostic console warnings.
 */
export const DEBUG_PREFIX = '[Atom Effect]';

/**
 * @internal
 * Why: `Object.is` is preferred over `===` because it handles `NaN` and `+0/-0`
 * correctly, preventing infinite recursion or unnecessary updates on edge cases.
 */
export const DEFAULT_EQUAL = Object.is;

/**
 * @internal
 * Why: V8 represents 31-bit signed integers directly in registers (SMI) on
 * 64-bit systems, avoiding heap allocation and boxing. Ideal for epoch counters.
 */
export const SMI_MAX = 0x3fffffff;

/**
 * @internal
 * Constraint: Development-time constraints to protect the main thread.
 * Prevents infinite loops and runaway effect triggers in developer builds.
 */
export const DEBUG_CONFIG = {
  WARN_INFINITE_LOOP: true,
  EFFECT_FREQUENCY_WINDOW: 1000,
  LOOP_THRESHOLD: 100,
} as const;

/**
 * @internal
 * Optimization: Buffer limits for dependency list management.
 * Flat linear array searches are faster than Map lookups up to 8 items
 * due to CPU cache locality and lower initialization overhead.
 */
export const BUFFER_CONFIG = {
  MAP_THRESHOLD: 8,
} as const;

/**
 * @internal
 * Constraint: Limits lens property generation to prevent stack overflow.
 * Protects the path resolver against circular or excessively deep hierarchies.
 */
export const LENS_CONFIG = {
  MAX_PATH_DEPTH: 8,
} as const;

/**
 * @internal
 * Logic: Initial values for epoch-based dependency staleness tracking.
 */
export const EPOCH_CONSTANTS = {
  UNINITIALIZED: -1,
  MIN: 1,
} satisfies Record<string, number>;

/**
 * A boolean flag indicating whether the library is running in a development environment.
 *
 * When to use:
 * - When adding developer-only validation or diagnostic checks that should be omitted in production.
 * - When configuring custom logger thresholds.
 *
 * @remarks
 * Resolved dynamically using a self-evaluating IIFE. Inspects bundler environment flags,
 * Node process variables, and global window properties (`__ATOM_DEBUG__` / `sessionStorage`).
 *
 * @example
 * ```typescript
 * import { IS_DEV } from '@but212/atom-effect';
 *
 * if (IS_DEV) {
 *   console.log('Development mode is active');
 * }
 * ```
 */
export const IS_DEV = (() => {
  try {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') return true;
    if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
    if (
      typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV
    )
      return true;
    if (
      typeof globalThis !== 'undefined' &&
      (globalThis as unknown as { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__
    )
      return true;
    if (
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem('__ATOM_DEBUG__') === 'true'
    )
      return true;
  } catch {}
  return false;
})();

declare const __DEV__: boolean;

/**
 * @internal
 * Role: Master dictionary of internal node state flags.
 * Organized into offsets (0: Core, 8: Computed, 16: Async, 24: Atom, 28: Effect).
 */
const FLAGS = {
  DISPOSED: 1 << 0,
  IS_COMPUTED: 1 << 1,

  DIRTY: 1 << 8,
  RECOMPUTING: 1 << 9,
  FORCE_COMPUTE: 1 << 11,
  CHECKING_DIRTY: 1 << 12,

  ASYNC_MASK: 3 << 16,
  IDLE: 0 << 16,
  PENDING: 1 << 16,
  RESOLVED: 2 << 16,
  REJECTED: 3 << 16,

  ATOM_SYNC: 1 << 24,
  ATOM_NOTIFICATION_SCHEDULED: 1 << 25,

  EFFECT_EXECUTING: 1 << 28,
} as const;

/**
 * @internal
 * Optimization: Compound masks for batched bitwise node validations.
 * Allows validating complex condition combinations (e.g., recomputing or cyclic)
 * using a single bitwise comparison instead of branching multiple checks.
 */
export const STATE_MASKS = {
  ASYNC_MASK: FLAGS.ASYNC_MASK,
  COMPUTED_DIRTY_MASK: FLAGS.DIRTY | FLAGS.RECOMPUTING | FLAGS.FORCE_COMPUTE,
  CYCLIC_OR_RECOMPUTING_MASK: FLAGS.RECOMPUTING | FLAGS.CHECKING_DIRTY,
  LIFECYCLE_MASK: FLAGS.ASYNC_MASK | FLAGS.DIRTY,
  ERROR_MASK: FLAGS.REJECTED,
} as const;

/**
 * @internal
 * Role: Flag contract exposing public capabilities for generic state nodes.
 */
export const STATE_FLAGS = {
  DISPOSED: FLAGS.DISPOSED,
} as const;

/**
 * @internal
 * Role: Flag contract exposing public capabilities for Effect nodes.
 */
export const EFFECT_STATE_FLAGS = {
  DISPOSED: FLAGS.DISPOSED,
  EXECUTING: FLAGS.EFFECT_EXECUTING,
} as const;

/**
 * @internal
 * Role: Flag contract exposing public capabilities for Computed nodes.
 */
export const COMPUTED_STATE_FLAGS = {
  DISPOSED: FLAGS.DISPOSED,
  IS_COMPUTED: FLAGS.IS_COMPUTED,
  DIRTY: FLAGS.DIRTY,
  ASYNC_MASK: FLAGS.ASYNC_MASK,
  IDLE: FLAGS.IDLE,
  PENDING: FLAGS.PENDING,
  RESOLVED: FLAGS.RESOLVED,
  REJECTED: FLAGS.REJECTED,
  RECOMPUTING: FLAGS.RECOMPUTING,
  FORCE_COMPUTE: FLAGS.FORCE_COMPUTE,
  CHECKING_DIRTY: FLAGS.CHECKING_DIRTY,
} as const;

/**
 * @internal
 * Role: Flag contract exposing public capabilities for Atom nodes.
 */
export const ATOM_STATE_FLAGS = {
  DISPOSED: FLAGS.DISPOSED,
  SYNC: FLAGS.ATOM_SYNC,
  NOTIFICATION_SCHEDULED: FLAGS.ATOM_NOTIFICATION_SCHEDULED,
} as const;

/**
 * @internal
 * Logic: Internal state machine flags for scheduler updates.
 * Manages overlapping states (batching, flushing) in a single bitfield.
 */
export const SCHEDULER_STATE = Object.freeze({
  IDLE: 0,
  PROCESSING: 1 << 0,
  FLUSHING_SYNC: 1 << 1,
  BATCHING: 1 << 2,
} as const);

/**
 * Stability thresholds and limits for the global microtask scheduler.
 *
 * When to use:
 * - When tuning custom execution bounds for high-frequency or nested reactive updates.
 *
 * @remarks
 * Conforms to the `SchedulerConfig` interface. Limits nested iterations and execution
 * counts to prevent runaway microtask queues from freezing the event loop.
 *
 * @example
 * ```typescript
 * import { SCHEDULER_CONFIG } from '@but212/atom-effect';
 *
 * console.log('Maximum executions per flush:', SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH);
 * ```
 */
export const SCHEDULER_CONFIG = Object.freeze({
  MAX_EXECUTIONS_PER_SECOND: 1000,
  MAX_EXECUTIONS_PER_EFFECT: 100,
  MAX_EXECUTIONS_PER_FLUSH: 10000,
  MAX_FLUSH_ITERATIONS: 1000,
  MIN_FLUSH_ITERATIONS: 10,
} as const satisfies SchedulerConfig);

/**
 * @internal
 * Role: Unified message dictionary for standard engine errors.
 */
export const ERROR_MESSAGES = {
  COMPUTED_MUST_BE_FUNCTION: 'Computed target must be a function',
  COMPUTED_ASYNC_PENDING_NO_DEFAULT: 'Async computation pending with no default value',
  COMPUTED_COMPUTATION_FAILED: 'Computation execution failed',
  COMPUTED_ASYNC_COMPUTATION_FAILED: 'Async computation execution failed',
  COMPUTED_CIRCULAR_DEPENDENCY: 'Circular dependency detected',
  COMPUTED_DISPOSED: 'Attempted to access disposed computed',

  ATOM_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscriber must be a function or Subscriber object',
  ATOM_INDIVIDUAL_SUBSCRIBER_FAILED: 'Subscriber execution failed',

  EFFECT_MUST_BE_FUNCTION: 'Effect target must be a function',
  EFFECT_EXECUTION_FAILED: 'Effect execution failed',
  EFFECT_CLEANUP_FAILED: 'Effect cleanup failed',
  EFFECT_DISPOSED: 'Attempted to run disposed effect',

  SCHEDULER_FLUSH_OVERFLOW: (max: number, dropped: number): string =>
    `Maximum flush iterations (${max}) exceeded. ${dropped} jobs dropped. Possible infinite loop.`,

  CALLBACK_ERROR_IN_ERROR_HANDLER: 'Exception encountered in onError handler',
  EFFECT_FREQUENCY_LIMIT_EXCEEDED:
    'Effect executed too frequently within 1 second. Suspected infinite loop.',
  SCHEDULER_CALLBACK_MUST_BE_FUNCTION: 'Scheduler callback must be a function',
  SCHEDULER_END_BATCH_WITHOUT_START: 'endBatch() called without matching startBatch(). Ignoring.',
  BATCH_CALLBACK_MUST_BE_FUNCTION: 'Batch callback must be a function',
} as const;
