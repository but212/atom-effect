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
import { RESULT_SYMBOL } from './symbols';
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
 * Pre-allocated success result for void operations.
 * Optimization: Shared instance reduces allocation overhead for common 'return Result.ok()' calls.
 */
const VOID_SUCCESS = Object.freeze({
  ok: true,
  value: undefined,
  error: undefined,
  [RESULT_SYMBOL]: true,
} as const);

/**
 * Normalizes a caught value into an Error object.
 * Logic: Ensures that even raw string throws or null values are wrapped in a standard Error.
 */
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  try {
    return new Error(typeof e === 'string' ? e : String(e ?? 'Unknown error'), { cause: e });
  } catch {
    return new Error('Unknown error', { cause: e });
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
   * If the provided value is `undefined`, it will reuse the pre-allocated internal `VOID_SUCCESS`
   * singleton to avoid unnecessary memory allocations.
   *
   * @param value The value to wrap in Ok.
   * @returns An Ok Result wrapping the value.
   *
   * @example
   * const res = Result.ok(42);
   */
  ok: <T, E = never>(value: T): Result<T, E> =>
    (value === undefined
      ? VOID_SUCCESS
      : { ok: true, value, error: undefined, [RESULT_SYMBOL]: true }) as unknown as Result<T, E>,

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
    ({ ok: false, value: undefined, error, [RESULT_SYMBOL]: true }) as unknown as Result<T, E>,

  /**
   * Type guard to check if a Result contains a value (Ok).
   *
   * @param res The Result to check.
   * @returns True if the Result is Ok, false otherwise.
   */
  isOk: <T, E>(res: Result<T, E>): res is Ok<T> => res.ok,

  /**
   * Type guard to check if a Result contains an error (Err).
   *
   * @param res The Result to check.
   * @returns True if the Result is Err, false otherwise.
   */
  isErr: <T, E>(res: Result<T, E>): res is Err<E> => !res.ok,

  /**
   * Exhaustively handles both possible states of a Result.
   *
   * @param res The Result to match.
   * @param matcher The pattern matcher containing ok and err handlers.
   * @returns The returned value from the matched branch.
   *
   * @example
   * const value = Result.match(res, {
   *   ok: (v) => v * 2,
   *   err: (e) => 0
   * });
   */
  match: <T, E, R>(res: Result<T, E>, matcher: { ok: (val: T) => R; err: (err: E) => R }): R =>
    res.ok ? matcher.ok(res.value) : matcher.err(res.error),

  /**
   * Extracts the value if Ok, otherwise throws the error.
   *
   * @remarks
   * Calling this function will throw the wrapped error directly if the result is in an Err state.
   * Only call this if you are certain the result is Ok, or if throwing is the desired failure behavior.
   *
   * @param res The Result to unwrap.
   * @returns The inner value if Ok.
   * @throws {Error} The wrapped error if the Result is Err.
   */
  unwrap: <T, E>(res: Result<T, E>): T => {
    if (!res.ok) throw res.error;
    return res.value;
  },

  /**
   * Extracts the value if Ok, otherwise throws with a custom message.
   *
   * @remarks
   * The thrown Error will wrap the original error as its `cause`, preserving the stack trace
   * and failure details.
   *
   * @param res The Result to unwrap.
   * @param msg The custom error message.
   * @returns The inner value if Ok.
   * @throws {Error} An Error with the custom message and original error as cause if Err.
   */
  expect: <T, E>(res: Result<T, E>, msg: string): T => {
    if (!res.ok) throw new Error(msg, { cause: res.error });
    return res.value;
  },

  /**
   * Returns the value if Ok, otherwise returns the fallback value.
   *
   * @param res The Result to unwrap.
   * @param fallback The fallback value.
   * @returns The inner value if Ok, otherwise the fallback value.
   */
  unwrapOr: <T, E, U>(res: Result<T, E>, fallback: U): T | U => (res.ok ? res.value : fallback),

  /**
   * Returns the value if Ok, otherwise computes a fallback via the provided function.
   *
   * @param res The Result to unwrap.
   * @param fn The function to compute fallback.
   * @returns The inner value if Ok, otherwise the result of fn.
   */
  unwrapOrElse: <T, E, U>(res: Result<T, E>, fn: (err: E) => U): T | U =>
    res.ok ? res.value : fn(res.error),

  /**
   * Transforms the inner value using the provided function if Ok.
   *
   * @remarks
   * Implements an optimization where the original Result instance is returned unmodified
   * if the mapping function returns the same value (determined via `Object.is`).
   *
   * @param res The Result to map.
   * @param fn The mapping function.
   * @returns A new Result with the transformed value, or the original Err.
   */
  map: <T, E, U>(res: Result<T, E>, fn: (val: T) => U): Result<U, E> => {
    if (!res.ok) return res as unknown as Result<U, E>;
    const next = fn(res.value);
    return Object.is(next, res.value) ? (res as unknown as Result<U, E>) : Result.ok(next);
  },

  /**
   * Transforms the inner error using the provided function if Err.
   *
   * @param res The Result to map.
   * @param fn The mapping function.
   * @returns A new Result with the transformed error, or the original Ok.
   */
  mapErr: <T, E, F>(res: Result<T, E>, fn: (err: E) => F): Result<T, F> =>
    res.ok ? (res as unknown as Result<T, F>) : Result.err(fn(res.error)),

  /**
   * Chains a function that returns another Result if Ok.
   *
   * @param res The Result to chain.
   * @param fn The chaining function.
   * @returns The Result returned by fn, or the original Err.
   */
  andThen: <T, E, U, F>(res: Result<T, E>, fn: (val: T) => Result<U, F>): Result<U, E | F> =>
    res.ok ? fn(res.value) : (res as unknown as Result<U, E | F>),

  /**
   * Wraps a synchronous function call that might throw.
   *
   * When to use:
   * - When executing code that may raise exceptions.
   *
   * @remarks
   * If the function throws a non-Error value, it is automatically normalized using `toError`
   * into a standard JavaScript `Error` with the thrown object set as the `cause`.
   *
   * @param fn The synchronous function.
   * @returns An Ok Result wrapping the return value, or an Err Result wrapping the caught error.
   */
  tryCatch: <T>(fn: () => T): Result<T, Error> => {
    try {
      return Result.ok<T>(fn());
    } catch (e) {
      return Result.err(toError(e));
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
   * @param fn The asynchronous function.
   * @returns A Promise resolving to an Ok Result wrapping the value, or an Err Result wrapping the caught error.
   */
  tryAsync: async <T>(fn: () => PromiseLike<T>): Promise<Result<T, Error>> => {
    try {
      const value = await fn();
      return Result.ok<T>(value);
    } catch (e) {
      return Result.err(toError(e));
    }
  },

  /**
   * Converts a Result to an Option, dropping the error data.
   *
   * @param res The Result to convert.
   * @returns Some wrapping the value if Ok, otherwise None.
   */
  toOption: <T, E>(res: Result<T, E>): Option<T> => (res.ok ? Option.some(res.value) : Option.none),
};
