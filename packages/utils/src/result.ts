import { Option } from './option';
import { RESULT_SYMBOL } from './symbols';
import type { Prettify } from './types';

/**
 * Base type for Result variants to ensure symbol-based identification.
 */
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
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Pre-allocated success result for void operations.
 * Logic: Shared instance reduces allocation overhead for common 'return Result.ok()' calls.
 */
const VOID_SUCCESS = Object.freeze({
  ok: true,
  value: undefined,
  error: undefined,
  [RESULT_SYMBOL]: true,
} as const) satisfies Result<void, never>;

/**
 * Normalizes a caught value into an Error object.
 * Logic: Ensures that even raw string throws or null values are wrapped in a standard Error.
 */
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  const message = typeof e === 'string' ? e : String(e ?? 'Unknown error');
  return new Error(message, { cause: e });
}

/**
 * Utilities for creating and consuming Result types.
 */
export const Result = {
  /**
   * Creates a successful Result.
   */
  ok: <T, E = never>(value: T): Result<T, E> => {
    if ((value as unknown) === undefined) return VOID_SUCCESS as unknown as Result<T, E>;
    return {
      ok: true,
      value,
      error: undefined,
      [RESULT_SYMBOL]: true,
    } as Ok<T>;
  },

  /**
   * Creates a failed Result.
   */
  err: <T = never, E = Error>(error: E): Result<T, E> =>
    ({
      ok: false,
      value: undefined,
      error,
      [RESULT_SYMBOL]: true,
    }) as Err<E>,

  /**
   * Type guard for Ok variant.
   */
  isOk: <T, E>(res: Result<T, E>): res is Ok<T> => res.ok,

  /**
   * Type guard for Err variant.
   */
  isErr: <T, E>(res: Result<T, E>): res is Err<E> => !res.ok,

  /**
   * Exhaustively handles both possible states of a Result.
   */
  match: <T, E, R>(res: Result<T, E>, matcher: { ok: (val: T) => R; err: (err: E) => R }): R =>
    res.ok ? matcher.ok(res.value) : matcher.err(res.error),

  /**
   * Extracts the value if Ok, otherwise throws the error.
   */
  unwrap: <T, E>(res: Result<T, E>): T => {
    if (!res.ok) throw res.error;
    return res.value;
  },

  /**
   * Extracts the value if Ok, otherwise throws with a custom message.
   */
  expect: <T, E>(res: Result<T, E>, msg: string): T => {
    if (!res.ok) throw new Error(msg);
    return res.value;
  },

  /**
   * Returns the value if Ok, otherwise returns the fallback value.
   */
  unwrapOr: <T, E, U>(res: Result<T, E>, fallback: U): T | U => (res.ok ? res.value : fallback),

  /**
   * Returns the value if Ok, otherwise computes a fallback via the provided function.
   */
  unwrapOrElse: <T, E, U>(res: Result<T, E>, fn: (err: E) => U): T | U =>
    res.ok ? res.value : fn(res.error),

  /**
   * Transforms the inner value using the provided function if Ok.
   * Optimization: Returns the original instance if the value remains unchanged.
   */
  map: <T, E, U>(res: Result<T, E>, fn: (val: T) => U): Result<U, E> => {
    if (!res.ok) return res as unknown as Result<U, E>;
    const next = fn(res.value);
    return (next as unknown) === res.value ? (res as unknown as Result<U, E>) : Result.ok(next);
  },

  /**
   * Transforms the inner error using the provided function if Err.
   */
  mapErr: <T, E, F>(res: Result<T, E>, fn: (err: E) => F): Result<T, F> =>
    res.ok ? (res as unknown as Result<T, F>) : Result.err(fn(res.error)),

  /**
   * Chains a function that returns another Result if Ok.
   */
  andThen: <T, E, U, F>(res: Result<T, E>, fn: (val: T) => Result<U, F>): Result<U, E | F> =>
    res.ok ? fn(res.value) : (res as unknown as Result<U, E | F>),

  /**
   * Wraps a synchronous function call that might throw.
   */
  tryCatch: <T, E = Error>(fn: () => T): Result<T, E> => {
    try {
      return Result.ok(fn());
    } catch (e) {
      return Result.err(toError(e) as unknown as E);
    }
  },

  /**
   * Wraps an asynchronous operation into a Result-bearing Promise.
   */
  tryAsync: <T, E = Error>(fn: () => PromiseLike<T>): Promise<Result<T, E>> => {
    try {
      const p = fn();
      return Promise.resolve(p).then(
        (value) => Result.ok<T, E>(value),
        (error) => Result.err<T, E>(toError(error) as unknown as E)
      );
    } catch (e) {
      return Promise.resolve(Result.err<T, E>(toError(e) as unknown as E));
    }
  },

  /**
   * Converts a Result to an Option, dropping the error data.
   */
  toOption: <T, E>(res: Result<T, E>): Option<T> => (res.ok ? Option.some(res.value) : Option.none),
};
