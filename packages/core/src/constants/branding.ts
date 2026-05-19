/**
 * @module Branding
 *
 * This module provides the internal type-branding mechanism for all reactive primitives.
 *
 * Design Intent:
 * Instead of multiple boolean properties (e.g., `_isAtom`, `_isComputed`), we use a single
 * property keyed by the `BRAND` symbol to store bitwise flags. This reduces object
 * size and minimizes "hidden class" transitions in the V8 engine, keeping property
 * lookups on the hot path highly efficient.
 */

/**
 * The unique identifier for internal metadata lookups.
 *
 * Why: Using a single Symbol avoids property name collisions and consolidates
 * multiple type markers into one memory slot.
 *
 * @example
 * // Accessing flags from a reactive node
 * const flags = (node as any)[BRAND];
 * const isReactive = flags !== undefined;
 */
export const BRAND: unique symbol = Symbol.for('atom-effect/brand');

/**
 * Bitwise flags for granular type and capability discrimination.
 *
 * Constraints:
 * - Values must be powers of 2 to maintain bitwise integrity.
 * - Checking for a type MUST use the bitwise AND operator.
 *
 * @example
 * // Correct check for Writable capability
 * const isWritable = !!(flags & BrandFlags.Writable);
 *
 * // Correct check for Atom type
 * const isAtom = !!(flags & BrandFlags.Atom);
 */
export const BrandFlags = {
  /** The primitive represents a state source (Readonly or Writable). */
  Atom: 1 << 0,
  /** The primitive supports external mutation via .set() or .update(). */
  Writable: 1 << 1,
  /** The primitive derives its value from other reactive dependencies. */
  Computed: 1 << 2,
  /** The handle represents an active side-effect subscription. */
  Effect: 1 << 3,
  /** The primitive is a focused view into a nested state structure. */
  Lens: 1 << 4,
} as const;

/**
 * Mask for filtering core reactive types (Atom, Computed, Effect).
 * @internal
 */
export const BRAND_MASK = BrandFlags.Atom | BrandFlags.Computed | BrandFlags.Effect;

/**
 * Metadata for resolving human-readable node identities.
 * @internal
 */
export const BRAND_IDENTITY_MAP = {
  [BrandFlags.Atom]: { type: 'atom', prefix: 'atom_' },
  [BrandFlags.Atom | BrandFlags.Computed]: { type: 'computed', prefix: 'calc_' },
  [BrandFlags.Effect]: { type: 'effect', prefix: 'fx_' },
} as const satisfies Record<number, { type: string; prefix: string }>;
