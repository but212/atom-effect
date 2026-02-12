/**
 * Brand symbols for reliable type identification.
 * Prevents false positives from duck-typing with external objects.
 */
export const ATOM_BRAND: unique symbol = Symbol.for('atom-effect/atom');
export const COMPUTED_BRAND: unique symbol = Symbol.for('atom-effect/computed');
export const EFFECT_BRAND: unique symbol = Symbol.for('atom-effect/effect');
