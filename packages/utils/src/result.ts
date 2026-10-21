/**
 * @module Result
 *
 * Responsibility:
 * Provides the Result monad variant (Ok/Err) for functional error handling.
 *
 * Design Intent:
 * Encourages explicit error handling by representing computations that can either succeed (Ok) or fail (Err).
 */

/**
 * Logic: Success Variant
 * Represents a successful computation result holding a value of type T.
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
  readonly error: undefined;
}

/**
 * Logic: Failure Variant
 * Represents a failed computation holding an error of type E.
 */
export interface Err<E> {
  readonly ok: false;
  readonly value: undefined;
  readonly error: E;
}

/**
 * A discriminated union representing success (Ok) or failure (Err).
 *
 * @remarks
 * Use this type to model computations that can intentionally fail without raising exceptions.
 * By using this discriminated union, consumers are forced to check `res.ok` before accessing
 * `value` or `error`, which is enforced at compile time.
 *
 * @defaultValue `Error` for the generic error type `E` if not specified.
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Pre-allocated success result for void operations.
 * Optimization: Shared instance reduces allocation overhead for common 'return Result.ok()' calls.
 */
const voidSuccessResult: Result<unknown, never> = Object.freeze({
  ok: true,
  value: undefined,
  error: undefined,
} as const);

/**
 * Normalizes a caught value into an Error object.
 * Logic: Ensures that even raw string throws or null values are wrapped in a standard Error.
 */
function ensureError(error: unknown): Error {
  if (error instanceof Error) return error;
  try {
    return new Error(typeof error === 'string' ? error : String(error ?? 'Unknown error'), {
      cause: error,
    });
  } catch {
    return new Error('Unknown error', { cause: error });
  }
}

/**
 * Utilities for creating and consuming Result types.
 *
 * When to use:
 * - When you need to wrap fallible synchronous or asynchronous functions without throwing.
 * - When mapping, chaining, or matching over success and failure outcomes.
 */
export const Result = {
  /**
   * Creates a successful Result.
   *
   * When to use:
   * - When returning a successful value from a fallible operation.
   *
   * @remarks
   * If the provided value is `undefined`, it will reuse the pre-allocated internal `voidSuccessResult`
   * singleton to avoid unnecessary memory allocations.
   *
   * @param successValue The value to wrap in Ok.
   * @returns An Ok Result wrapping the value.
   *
   * @example
   * const res = Result.ok(42);
   */
  ok: <T, E = never>(successValue: T): Result<T, E> =>
    successValue === undefined
      ? (voidSuccessResult as Result<T, E>)
      : ({
          ok: true,
          value: successValue,
          error: undefined,
        } as Result<T, E>),

  /**
   * Creates a failed Result.
   *
   * When to use:
   * - When returning an error from a fallible operation.
   *
   * @param failureError The error value to wrap in Err.
   * @returns An Err Result wrapping the error.
   *
   * @example
   * const res = Result.err(new Error("failed"));
   */
  err: <T = never, E = Error>(failureError: E): Result<T, E> =>
    ({
      ok: false,
      value: undefined,
      error: failureError,
    }) as Result<T, E>,

  /**
   * Type guard to check if a Result contains an error (Err).
   *
   * @param result The Result to check.
   * @returns True if the Result is Err, false otherwise.
   */
  isErr: <T, E>(result: Result<T, E>): result is Err<E> => !result.ok,

  /**
   * Extracts the value if Ok, otherwise throws the error.
   *
   * @remarks
   * Calling this function will throw the wrapped error directly if the result is in an Err state.
   * Only call this if you are certain the result is Ok, or if throwing is the desired failure behavior.
   *
   * @param targetResult The Result to unwrap.
   * @returns The inner value if Ok.
   * @throws {Error} The wrapped error if the Result is Err.
   */
  unwrap: <T, E>(targetResult: Result<T, E>): T => {
    if (!targetResult.ok) throw targetResult.error;
    return targetResult.value;
  },

  /**
   * Wraps a synchronous function call that might throw.
   *
   * When to use:
   * - When executing code that may raise exceptions.
   *
   * @remarks
   * If the function throws a non-Error value, it is automatically normalized using `ensureError`
   * into a standard JavaScript `Error` with the thrown object set as the `cause`.
   *
   * @param operationCallback The synchronous function.
   * @returns An Ok Result wrapping the return value, or an Err Result wrapping the caught error.
   */
  tryCatch: <T>(operationCallback: () => T): Result<T, Error> => {
    try {
      return Result.ok<T>(operationCallback());
    } catch (caughtError) {
      return Result.err(ensureError(caughtError));
    }
  },
};
