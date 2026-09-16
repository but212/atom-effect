/**
 * @module Result
 *
 * Responsibility:
 * Provides the Result monad variant (Ok/Err) for functional error handling.
 *
 * Design Intent:
 * Encourages explicit error handling by representing computations that can either succeed (Ok) or fail (Err).
 */

import { RESULT_BRAND, RESULT_SYMBOL } from './symbols';

type ResultBase = {
  readonly [RESULT_SYMBOL]: unknown;
};

/**
 * Logic: Success Variant
 * Represents a successful computation result holding a value of type T.
 */
export interface Ok<T> extends ResultBase {
  readonly ok: true;
  readonly value: T;
  readonly error: undefined;
}

/**
 * Logic: Failure Variant
 * Represents a failed computation holding an error of type E.
 */
export interface Err<E> extends ResultBase {
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
 * Checks if a value is a valid {@link Result} instance.
 *
 * When to use:
 * - To verify at runtime whether an unknown input conforms to the Result protocol.
 *
 * @param targetValue The value to check.
 * @returns True if the value is a Result, false otherwise.
 *
 * @example
 * const isRes = isResult(Result.ok(42)); // true
 */
export const isResult = (targetValue: unknown): targetValue is Result<unknown, unknown> => {
  if (targetValue === null || typeof targetValue !== 'object') return false;

  try {
    const candidate = targetValue as Record<PropertyKey, unknown>;
    if (
      !Object.hasOwn(candidate, RESULT_SYMBOL) ||
      candidate[RESULT_SYMBOL] !== true ||
      !Object.hasOwn(candidate, RESULT_BRAND) ||
      candidate[RESULT_BRAND] !== true ||
      !Object.hasOwn(candidate, 'ok') ||
      !Object.hasOwn(candidate, 'value') ||
      !Object.hasOwn(candidate, 'error')
    ) {
      return false;
    }

    if (candidate.ok === true) return candidate.error === undefined;
    if (candidate.ok === false) return candidate.value === undefined;
    return false;
  } catch {
    return false;
  }
};

// Logic: Asserts that a value is a valid Result instance. Used only at trust boundaries.
function assertResult(targetValue: unknown): asserts targetValue is Result<unknown, unknown> {
  if (!isResult(targetValue)) {
    throw new Error('Invalid Result instance');
  }
}

/**
 * Pre-allocated success result for void operations.
 * Optimization: Shared instance reduces allocation overhead for common 'return Result.ok()' calls.
 */
const voidSuccessResult: Result<unknown, never> = Object.freeze({
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

function fromPredicate<T, U extends T, E = Error>(
  value: T,
  predicate: (value: T) => value is U,
  errorFactory?: () => E
): Result<U, E>;
function fromPredicate<T, E = Error>(
  value: T,
  predicate: (value: T) => boolean,
  errorFactory?: () => E
): Result<T, E>;
function fromPredicate(
  targetValue: unknown,
  predicate: (value: unknown) => boolean,
  errorFactoryCallback?: () => unknown
): Result<unknown, unknown> {
  return predicate(targetValue)
    ? Result.ok(targetValue)
    : Result.err(errorFactoryCallback ? errorFactoryCallback() : new Error('Predicate failed'));
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
          [RESULT_SYMBOL]: true,
          [RESULT_BRAND]: true,
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
      [RESULT_SYMBOL]: true,
      [RESULT_BRAND]: true,
    }) as Result<T, E>,

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
   * @param targetResult The Result to match.
   * @param resultMatcher The pattern matcher containing ok and err handlers.
   * @returns The returned value from the matched branch.
   *
   * @example
   * const value = Result.match(res, {
   *   ok: (v) => v * 2,
   *   err: (e) => 0
   * });
   */
  match: <T, E, R>(
    targetResult: Result<T, E>,
    resultMatcher: { ok: (value: T) => R; err: (error: E) => R }
  ): R =>
    targetResult.ok ? resultMatcher.ok(targetResult.value) : resultMatcher.err(targetResult.error),

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
   * Extracts the value if Ok, otherwise throws with a custom message.
   *
   * @remarks
   * The thrown Error will wrap the original error as its `cause`, preserving the stack trace
   * and failure details.
   *
   * @param targetResult The Result to unwrap.
   * @param message The custom error message.
   * @returns The inner value if Ok.
   * @throws {Error} An Error with the custom message and original error as cause if Err.
   */
  expect: <T, E>(targetResult: Result<T, E>, message: string): T => {
    if (!targetResult.ok) throw new Error(message, { cause: targetResult.error });
    return targetResult.value;
  },

  /**
   * Returns the value if Ok, otherwise returns the fallback value.
   *
   * @param targetResult The Result to unwrap.
   * @param fallback The fallback value.
   * @returns The inner value if Ok, otherwise the fallback value.
   */
  unwrapOr: <T, E, U>(targetResult: Result<T, E>, fallback: U): T | U =>
    targetResult.ok ? targetResult.value : fallback,

  /**
   * Returns the value if Ok, otherwise computes a fallback via the provided function.
   *
   * @param targetResult The Result to unwrap.
   * @param fallbackProvider The function to compute fallback.
   * @returns The inner value if Ok, otherwise the result of fallbackProvider.
   */
  unwrapOrElse: <T, E, U>(targetResult: Result<T, E>, fallbackProvider: (error: E) => U): T | U =>
    targetResult.ok ? targetResult.value : fallbackProvider(targetResult.error),

  /**
   * Transforms the inner value using the provided function if Ok.
   *
   * @remarks
   * Implements an optimization where the original Result instance is returned unmodified
   * if the mapping function returns the same value (determined via `Object.is`).
   *
   * @param targetResult The Result to map.
   * @param valueMapperCallback The mapping function.
   * @returns A new Result with the transformed value, or the original Err.
   */
  map: <T, E, U>(
    targetResult: Result<T, E>,
    valueMapperCallback: (value: T) => U
  ): Result<U, E> => {
    if (!targetResult.ok) return targetResult;
    const mappedValue = valueMapperCallback(targetResult.value);
    return Object.is(mappedValue, targetResult.value) &&
      (mappedValue === null ||
        (typeof mappedValue !== 'object' && typeof mappedValue !== 'function') ||
        Object.isFrozen(mappedValue))
      ? (targetResult as unknown as Result<U, E>)
      : Result.ok(mappedValue);
  },

  /**
   * Transforms the inner error using the provided function if Err.
   *
   * @param targetResult The Result to map.
   * @param errorMapperCallback The mapping function.
   * @returns A new Result with the transformed error, or the original Ok.
   */
  mapErr: <T, E, F>(
    targetResult: Result<T, E>,
    errorMapperCallback: (error: E) => F
  ): Result<T, F> =>
    targetResult.ok ? targetResult : Result.err(errorMapperCallback(targetResult.error)),

  /**
   * Chains a function that returns another Result if Ok.
   *
   * @param targetResult The Result to chain.
   * @param chainingCallback The chaining function.
   * @returns The Result returned by chainingCallback, or the original Err.
   */
  andThen: <T, E, U, F>(
    targetResult: Result<T, E>,
    chainingCallback: (value: T) => Result<U, F>
  ): Result<U, E | F> => {
    if (!targetResult.ok) return targetResult;
    const mapped = chainingCallback(targetResult.value);
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
   * @param operationCallback The asynchronous function.
   * @returns A Promise resolving to an Ok Result wrapping the value, or an Err Result wrapping the caught error.
   */
  tryAsync: async <T>(operationCallback: () => PromiseLike<T>): Promise<Result<T, Error>> => {
    try {
      const asyncResultValue = await operationCallback();
      return Result.ok<T>(asyncResultValue);
    } catch (caughtError) {
      return Result.err(ensureError(caughtError));
    }
  },

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
   * @param comparableResultA - The first Result to compare.
   * @param comparableResultB - The second Result to compare.
   * @returns True if both Results represent the same state and value/error.
   *
   * @example
   * const equal = Result.equals(resA, resB);
   */
  equals: <T, E>(comparableResultA: Result<T, E>, comparableResultB: Result<T, E>): boolean => {
    // Logic: Fast-paths identical references before performing checks.
    if (!isResult(comparableResultA) || !isResult(comparableResultB)) return false;
    if (comparableResultA === comparableResultB) return true;
    if (comparableResultA.ok !== comparableResultB.ok) return false;
    return comparableResultA.ok
      ? Object.is(comparableResultA.value, comparableResultB.value)
      : Object.is(comparableResultA.error, comparableResultB.error);
  },

  /**
   * Combines an array of Results into a single Result containing an array of successful values.
   *
   * Returns the first Err encountered (fail-fast behavior).
   *
   * @param targetResults - An array of Result instances.
   * @returns Result containing an array of successful values, or the first Err.
   *
   * @example
   * const res = Result.all([Result.ok(1), Result.ok(2)]); // Ok([1, 2])
   */
  all: <T, E>(targetResults: Result<T, E>[]): Result<T[], E> => {
    const okValues: T[] = [];
    for (const resultItem of targetResults) {
      if (Result.isErr(resultItem)) return resultItem;
      okValues.push(resultItem.value);
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
  fromPredicate,

  /**
   * Alias for {@link Result.tryCatch}.
   *
   * @param operationCallback - The synchronous function that might throw.
   * @returns Ok wrapping the value, or Err wrapping the normalized caught Error.
   *
   * @example
   * const res = Result.fromThrowable(() => { throw new Error('fail'); });
   */
  fromThrowable: <T>(operationCallback: () => T): Result<T, Error> =>
    Result.tryCatch(operationCallback),
};
