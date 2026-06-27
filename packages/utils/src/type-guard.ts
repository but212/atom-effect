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
  return (
    value instanceof Promise ||
    (value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      typeof (value as { then?: unknown }).then === 'function')
  );
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
 * if (isResult(value)) {
 *   if (value.ok) console.log(value.value);
 * }
 */
export { isResult } from './result';
