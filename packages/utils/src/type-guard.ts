import type { Option } from './option';
import type { Result } from './result';

/**
 * Determines whether a value is a Promise or a Thenable.
 *
 * Logic: Implements a multi-tiered detection strategy that prioritizes native
 * `Promise` performance via `instanceof` before falling back to duck-typed
 * thenable identification for compatibility across different Promise implementations.
 *
 * @param value - The value to examine.
 * @returns True if the value is a promise-like object.
 *
 * @example
 * ```typescript
 * if (isPromise(result)) {
 *   result.then((val) => console.log(val));
 * }
 * ```
 */
export function isPromise<T = unknown>(value: unknown): value is PromiseLike<T> {
  // Optimization: Prioritize native Promise check for performance.
  if (value instanceof Promise) return true;

  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }

  // Logic: Fallback to duck-typing for cross-library compatibility (Promises/A+).
  return typeof (value as { then: unknown }).then === 'function';
}

/**
 * Checks if a value is an Option.
 */
export const isOption = (val: unknown): val is Option<unknown> =>
  typeof val === 'object' &&
  val !== null &&
  'ok' in val &&
  typeof (val as Record<'ok', unknown>).ok === 'boolean' &&
  typeof (val as { unwrap?: unknown }).unwrap === 'function';

/**
 * Checks if a value is a Result.
 */
export const isResult = (val: unknown): val is Result<unknown, unknown> =>
  typeof val === 'object' &&
  val !== null &&
  'ok' in val &&
  typeof (val as Record<'ok', unknown>).ok === 'boolean' &&
  typeof (val as { unwrap?: unknown }).unwrap === 'function';
