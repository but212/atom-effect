/**
 * The global brand symbol used for type identification across all reactive primitives.
 *
 * Optimization: A single consolidated symbol is used to store multiple type markers
 * using bitwise flags. This strategy minimizes property lookup overhead and reduces
 * the overall object size by avoiding multiple type-specific properties.
 *
 * When to use:
 * - To access the internal type metadata of a reactive node.
 * - To implement custom branded objects that need to integrate with the reactive system.
 */
export const BRAND: unique symbol = Symbol.for('atom-effect/brand');

/**
 * A collection of bitwise flags used for precise type discrimination.
 *
 * When to use:
 * - To identify the specific category of a reactive node (e.g., Atom, Computed, Effect).
 * - To verify the capabilities of a node (e.g., checking if it is writable).
 */
export const BrandFlags = {
  /** Indicates that the primitive is an atom (either Readonly or Writable). */
  Atom: 1 << 0,
  /** Indicates that the primitive supports write operations, such as `.set()` or `.update()`. */
  Writable: 1 << 1,
  /** Indicates that the primitive is a computed value with dependency tracking logic. */
  Computed: 1 << 2,
  /** Indicates that the primitive is an effect handle. */
  Effect: 1 << 3,
  /** Indicates that the primitive is a lens into a nested property. */
  Lens: 1 << 4,
} as const;
