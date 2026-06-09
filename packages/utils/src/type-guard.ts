import type { Result } from './result';

/**
 * Determines whether a value is a Promise or a Thenable.
 *
 * When to use:
 * - When you need to handle potentially asynchronous values from third-party
 *   libraries that might not use native Promises.
 *
 * Logic:
 * - Implements a tiered detection strategy. It prioritizes native `Promise`
 *   performance via `instanceof` before falling back to duck-typed thenable
 *   identification for Promises/A+ compatibility.
 *
 * @example
 * if (isPromise(value)) {
 *   value.then(result => console.log(result));
 * }
 */
export function isPromise<T = unknown>(value: unknown): value is PromiseLike<T> {
  // Optimization: Prioritize native Promise check for speed.
  if (value instanceof Promise) return true;

  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }

  // Logic: Fallback to duck-typing for cross-library compatibility.
  return typeof (value as { then: unknown }).then === 'function';
}

export { isOption } from './option';

/**
 * Checks if a value is a valid {@link Result} instance.
 *
 * When to use:
 * - When validating if an unknown object is a Result from this library.
 *
 * Logic:
 * - Uses `RESULT_SYMBOL` for disambiguation, preventing {@link Option}
 *   or generic objects from being misidentified as Results.
 *
 * @example
 * if (isResult(val)) {
 *   if (val.ok) console.log(val.value);
 * }
 */
export { isResult } from './result';
