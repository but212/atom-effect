/**
 * Global brand symbol for all reactive primitives in the Atom Effect system.
 *
 * Optimization: Uses a single consolidated symbol to store multiple type markers
 * via bitwise flags, minimizing property lookups and object size.
 *
 * Use this when:
 * - Direct property access for type identification is required.
 * - Implementing custom branded objects.
 */
export const BRAND: unique symbol = Symbol.for('atom-effect/brand');

/**
 * Bitwise flags for type identification.
 *
 * When to use:
 * - Identifying the category of a reactive node in high-frequency loops.
 * - Checking capabilities (e.g., if an atom is Writable).
 */
export const BrandFlags = {
  /** Primitive is an atom (Readonly or Writable). */
  Atom: 1 << 0,
  /** Primitive supports write operations (.set/.update). */
  Writable: 1 << 1,
  /** Primitive is a computed value with manual dependency tracking. */
  Computed: 1 << 2,
  /** Primitive is an effect object. */
  Effect: 1 << 3,
} as const;
