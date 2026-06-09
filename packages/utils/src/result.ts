/**
 * @module Result
 *
 * Responsibility:
 * Provides the Result monad variant (Ok/Err) for functional error handling.
 *
 * Design Intent:
 * Encourages explicit error handling by representing computations that can either succeed (Ok) or fail (Err).
 */

import { Option } from './option';
import { RESULT_BRAND, RESULT_SYMBOL } from './symbols';
import type { Prettify } from './types';

type ResultBase = {
  readonly [RESULT_SYMBOL]: true;
};

/**
 * Logic: Success Variant
 * Represents a successful computation result holding a value of type T.
 */
export type Ok<T> = ResultBase &
  Prettify<{
    readonly ok: true;
    readonly value: T;
    readonly error: undefined;
  }>;

/**
 * Logic: Failure Variant
 * Represents a failed computation holding an error of type E.
 */
export type Err<E> = ResultBase &
  Prettify<{
    readonly ok: false;
    readonly value: undefined;
    readonly error: E;
  }>;

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
 * Checks if a value is a valid {@link Result} instance.
 *
 * When to use:
 * - To verify at runtime whether an unknown input conforms to the Result protocol.
 *
 * @param value - The value to check.
 * @returns True if the value is a Result, false otherwise.
 *
 * @example
 * const isRes = isResult(Result.ok(42)); // true
 */
export const isResult = (value: unknown): value is Result<unknown, unknown> =>
  !!value && typeof value === 'object' && (value as Record<symbol, unknown>)[RESULT_BRAND] === true;

// Logic: Asserts that a value is a valid Result instance. Used only at trust boundaries.
function assertResult(value: unknown): asserts value is Result<unknown, unknown> {
  if (!isResult(value)) {
    throw new Error('Invalid Result instance');
  }
}

/**
 * Pre-allocated success result for void operations.
 * Optimization: Shared instance reduces allocation overhead for common 'return Result.ok()' calls.
 */
const voidSuccessResult = Object.freeze({
  ok: true,
  value: undefined,
  error: undefined,
  [RESULT_SYMBOL]: true,
  [RESULT_BRAND]: true,
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
   * @param value The value to wrap in Ok.
   * @returns An Ok Result wrapping the value.
   *
   * @example
   * const res = Result.ok(42);
   */
  ok: <T, E = never>(value: T): Result<T, E> =>
    value === undefined
      ? (voidSuccessResult as unknown as Result<T, E>)
      : ({
          ok: true,
          value,
          error: undefined,
          [RESULT_SYMBOL]: true,
          [RESULT_BRAND]: true,
        } as unknown as Result<T, E>),

  /**
   * Creates a failed Result.
   *
   * When to use:
   * - When returning an error from a fallible operation.
   *
   * @param error The error value to wrap in Err.
   * @returns An Err Result wrapping the error.
   *
   * @example
   * const res = Result.err(new Error("failed"));
   */
  err: <T = never, E = Error>(error: E): Result<T, E> =>
    ({
      ok: false,
      value: undefined,
      error,
      [RESULT_SYMBOL]: true,
      [RESULT_BRAND]: true,
    }) as unknown as Result<T, E>,

  /**
   * Type guard to check if a Result contains a value (Ok).
   *
   * @param result The Result to check.
   * @returns True if the Result is Ok, false otherwise.
   */
  isOk: <T, E>(result: Result<T, E>): result is Ok<T> => result.ok,

  /**
   * Type guard to check if a Result contains an error (Err).
   *
   * @param result The Result to check.
   * @returns True if the Result is Err, false otherwise.
   */
  isErr: <T, E>(result: Result<T, E>): result is Err<E> => !result.ok,

  /**
   * Exhaustively handles both possible states of a Result.
   *
   * @param result The Result to match.
   * @param matcher The pattern matcher containing ok and err handlers.
   * @returns The returned value from the matched branch.
   *
   * @example
   * const value = Result.match(res, {
   *   ok: (v) => v * 2,
   *   err: (e) => 0
   * });
   */
  match: <T, E, R>(
    result: Result<T, E>,
    matcher: { ok: (value: T) => R; err: (error: E) => R }
  ): R => (result.ok ? matcher.ok(result.value) : matcher.err(result.error)),

  /**
   * Extracts the value if Ok, otherwise throws the error.
   *
   * @remarks
   * Calling this function will throw the wrapped error directly if the result is in an Err state.
   * Only call this if you are certain the result is Ok, or if throwing is the desired failure behavior.
   *
   * @param result The Result to unwrap.
   * @returns The inner value if Ok.
   * @throws {Error} The wrapped error if the Result is Err.
   */
  unwrap: <T, E>(result: Result<T, E>): T => {
    if (!result.ok) throw result.error;
    return result.value;
  },

  /**
   * Extracts the value if Ok, otherwise throws with a custom message.
   *
   * @remarks
   * The thrown Error will wrap the original error as its `cause`, preserving the stack trace
   * and failure details.
   *
   * @param result The Result to unwrap.
   * @param message The custom error message.
   * @returns The inner value if Ok.
   * @throws {Error} An Error with the custom message and original error as cause if Err.
   */
  expect: <T, E>(result: Result<T, E>, message: string): T => {
    if (!result.ok) throw new Error(message, { cause: result.error });
    return result.value;
  },

  /**
   * Returns the value if Ok, otherwise returns the fallback value.
   *
   * @param result The Result to unwrap.
   * @param fallback The fallback value.
   * @returns The inner value if Ok, otherwise the fallback value.
   */
  unwrapOr: <T, E, U>(result: Result<T, E>, fallback: U): T | U =>
    result.ok ? result.value : fallback,

  /**
   * Returns the value if Ok, otherwise computes a fallback via the provided function.
   *
   * @param result The Result to unwrap.
   * @param fallbackProvider The function to compute fallback.
   * @returns The inner value if Ok, otherwise the result of fallbackProvider.
   */
  unwrapOrElse: <T, E, U>(result: Result<T, E>, fallbackProvider: (error: E) => U): T | U =>
    result.ok ? result.value : fallbackProvider(result.error),

  /**
   * Transforms the inner value using the provided function if Ok.
   *
   * @remarks
   * Implements an optimization where the original Result instance is returned unmodified
   * if the mapping function returns the same value (determined via `Object.is`).
   *
   * @param result The Result to map.
   * @param mapper The mapping function.
   * @returns A new Result with the transformed value, or the original Err.
   */
  map: <T, E, U>(result: Result<T, E>, mapper: (value: T) => U): Result<U, E> => {
    if (!result.ok) return result;
    const mappedValue = mapper(result.value);

    // Optimization: Reuses the original Result instance if the value is unchanged and immutable.
    // To ensure no in-place mutation has occurred, reuse is only safe for primitive types (implicitly immutable) or frozen objects.
    const isImmutable =
      mappedValue === null ||
      (typeof mappedValue !== 'object' && typeof mappedValue !== 'function') ||
      Object.isFrozen(mappedValue);

    return Object.is(mappedValue, result.value) && isImmutable
      ? (result as unknown as Result<U, E>)
      : Result.ok(mappedValue);
  },

  /**
   * Transforms the inner error using the provided function if Err.
   *
   * @param result The Result to map.
   * @param errorMapper The mapping function.
   * @returns A new Result with the transformed error, or the original Ok.
   */
  mapErr: <T, E, F>(result: Result<T, E>, errorMapper: (error: E) => F): Result<T, F> =>
    result.ok ? result : Result.err(errorMapper(result.error)),

  /**
   * Chains a function that returns another Result if Ok.
   *
   * @param result The Result to chain.
   * @param mapper The chaining function.
   * @returns The Result returned by mapper, or the original Err.
   */
  andThen: <T, E, U, F>(
    result: Result<T, E>,
    mapper: (value: T) => Result<U, F>
  ): Result<U, E | F> => {
    if (!result.ok) return result;
    const mapped = mapper(result.value);
    assertResult(mapped);
    return mapped;
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
   * @param operation The synchronous function.
   * @returns An Ok Result wrapping the return value, or an Err Result wrapping the caught error.
   */
  tryCatch: <T>(operation: () => T): Result<T, Error> => {
    try {
      return Result.ok<T>(operation());
    } catch (e) {
      return Result.err(ensureError(e));
    }
  },

  /**
   * Wraps an asynchronous operation into a Result-bearing Promise.
   *
   * When to use:
   * - When executing async code or Promise-returning functions that may reject.
   *
   * @remarks
   * Similar to `tryCatch`, any thrown exceptions or rejected promises (including non-Error objects)
   * are captured and normalized into a standard `Error` wrapping the original rejection.
   *
   * @param operation The asynchronous function.
   * @returns A Promise resolving to an Ok Result wrapping the value, or an Err Result wrapping the caught error.
   */
  tryAsync: async <T>(operation: () => PromiseLike<T>): Promise<Result<T, Error>> => {
    try {
      const resolvedValue = await operation();
      return Result.ok<T>(resolvedValue);
    } catch (e) {
      return Result.err(ensureError(e));
    }
  },

  /**
   * Converts a Result to an Option, dropping the error data.
   *
   * @param result The Result to convert.
   * @returns Some wrapping the value if Ok, otherwise None.
   */
  toOption: <T, E>(result: Result<T, E>): Option<T> =>
    result.ok ? Option.some(result.value) : Option.none,

  /**
   * Checks for structural and value equality between two Results.
   *
   * @remarks
   * Performs a strict equality check using `Object.is` for values or errors. Returns false
   * if either input is not a valid Result instance.
   *
   * When to use:
   * - To compare two Result states for equivalence.
   *
   * @param resultA - The first Result to compare.
   * @param resultB - The second Result to compare.
   * @returns True if both Results represent the same state and value/error.
   *
   * @example
   * const equal = Result.equals(resA, resB);
   */
  equals: <T, E>(resultA: Result<T, E>, resultB: Result<T, E>): boolean => {
    // Logic: Fast-paths identical references before performing checks.
    if (!isResult(resultA) || !isResult(resultB)) return false;
    if (resultA === resultB) return true;
    if (resultA.ok !== resultB.ok) return false;
    return resultA.ok
      ? Object.is(resultA.value, resultB.value)
      : Object.is(resultA.error, resultB.error);
  },

  /**
   * Combines an array of Results into a single Result containing an array of successful values.
   *
   * Returns the first Err encountered (fail-fast behavior).
   *
   * @param results - An array of Result instances.
   * @returns Result containing an array of successful values, or the first Err.
   *
   * @example
   * const res = Result.all([Result.ok(1), Result.ok(2)]); // Ok([1, 2])
   */
  all: <T, E>(results: Result<T, E>[]): Result<T[], E> => {
    const okValues: T[] = [];
    for (const res of results) {
      if (Result.isErr(res)) return res;
      okValues.push(res.value);
    }
    return Result.ok(okValues);
  },

  /**
   * Creates a Result from a value based on a predicate function.
   *
   * If the predicate evaluates to true, it returns Ok wrapping the value.
   * Otherwise, it returns Err wrapping the error computed by the errorFactory.
   *
   * @param value - The value to evaluate.
   * @param predicate - The condition function.
   * @param errorFactory - An optional function generating the error. Defaults to generating a generic Error.
   * @returns Ok wrapping the value, or Err.
   *
   * @example
   * const res = Result.fromPredicate(42, x => x > 0); // Ok(42)
   */
  fromPredicate: ((
    value: unknown,
    predicate: (value: unknown) => boolean,
    errorFactory?: () => unknown
  ): Result<unknown, unknown> =>
    predicate(value)
      ? Result.ok(value)
      : Result.err(errorFactory ? errorFactory() : new Error('Predicate failed'))) as {
    <T, U extends T, E = Error>(value: T, predicate: (value: T) => value is U, errorFactory?: () => E): Result<U, E>;
    <T, E = Error>(value: T, predicate: (value: T) => boolean, errorFactory?: () => E): Result<T, E>;
  },

  /**
   * Alias for {@link Result.tryCatch}.
   *
   * @param operation - The synchronous function that might throw.
   * @returns Ok wrapping the value, or Err wrapping the normalized caught Error.
   *
   * @example
   * const res = Result.fromThrowable(() => { throw new Error('fail'); });
   */
  fromThrowable: <T>(operation: () => T): Result<T, Error> => Result.tryCatch(operation),
};
