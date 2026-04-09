/**
 * Global brand symbol for all reactive primitives.
 * Uses a bitwise mask for high-performance type identification.
 */
export const BRAND: unique symbol = Symbol.for('atom-effect/brand');

/**
 * Bitwise flags for brand identification.
 */
export const BrandFlags = {
  Atom: 1 << 0,
  Writable: 1 << 1,
  Computed: 1 << 2,
  Effect: 1 << 3,
} as const;
