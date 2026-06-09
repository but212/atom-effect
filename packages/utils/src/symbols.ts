/**
 * @module symbols
 * Internal symbols used for robust type identification.
 */

/**
 * @internal
 * Public symbol used in type definitions for Option (for structural compatibility).
 */
export const OPTION_SYMBOL = Symbol.for('atom-effect.Option');

/**
 * @internal
 * Public symbol used in type definitions for Result (for structural compatibility).
 */
export const RESULT_SYMBOL = Symbol.for('atom-effect.Result');

/**
 * @internal
 * Private brand symbol for runtime verification of Option (security).
 * This is intentionally NOT exported to public API to prevent external forgery.
 */
export const OPTION_BRAND = Symbol('OptionBrand');

/**
 * @internal
 * Private brand symbol for runtime verification of Result (security).
 * This is intentionally NOT exported to public API to prevent external forgery.
 */
export const RESULT_BRAND = Symbol('ResultBrand');
