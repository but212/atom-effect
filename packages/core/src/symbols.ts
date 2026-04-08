/**
 * Brand symbols for reliable type identification.
 * Prevents false positives from duck-typing with external objects.
 */
export const ATOM_BRAND: unique symbol = Symbol.for('atom-effect/atom');
export const COMPUTED_BRAND: unique symbol = Symbol.for('atom-effect/computed');
export const EFFECT_BRAND: unique symbol = Symbol.for('atom-effect/effect');

/**
 * Positive writable brand — only stamped on truly mutable atoms.
 * Allows future ReadonlyAtom / derived primitives to carry ATOM_BRAND
 * without being misidentified as writable by isWritable().
 */
export const WRITABLE_BRAND: unique symbol = Symbol.for('atom-effect/writable');

/**
 * Marker for missing optional default values.
 * Use private Symbol to prevent identity spoofing from external code.
 */
export const NO_DEFAULT_VALUE: unique symbol = Symbol('atom-effect/no-default-value');

/** Internal debug symbols. */
export const DEBUG_NAME: unique symbol = Symbol('atom-effect/debug-name');
export const DEBUG_TYPE: unique symbol = Symbol('atom-effect/debug-type');
