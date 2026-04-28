import { None, type Option, Some } from '@/option';
import { isPromise } from './type-guard';

/**
 * Represents a successful computation result.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };

/**
 * Represents a failed computation result.
 */
export type Err<E> = { readonly ok: false; readonly error: E };

/**
 * Result Variant Types (Logic: Data structure is central)
 * Explicitly named variants improve readability and simplify type narrowing.
 *
 * When to use:
 * - When an operation can fail and the error needs to be handled explicitly.
 * - To replace traditional try-catch blocks with a declarative functional pipeline.
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * @internal
 * Logic: Internal capture helper to cast unknown errors to a specific error type.
 */
const capture = <E>(e: unknown): E => e as E;

/**
 * Internal type guard to check if a value conforms to the Result structure.
 * Logic: We check for the presence of the 'ok' property and either 'value' or 'error'.
 */
const isResult = (val: unknown): val is Result<unknown, unknown> =>
  val !== null && typeof val === 'object' && 'ok' in val && ('value' in val || 'error' in val);

/**
 * Result Static Utilities
 * Unified entry point for all Result-related operations.
 *
 * When to use:
 * - As the primary interface for creating and manipulating Result types.
 */
export const Result = {
  /**
   * Creates an Ok variant.
   *
   * When to use:
   * - To wrap a successful value in a Result object.
   *
   * @param value The value to wrap.
   * @returns An Ok result containing the value.
   *
   * @example
   * const res = Result.ok(10); // Result<number, never>
   */
  ok: <T>(value: T): Result<T, never> => ({ ok: true, value }),

  /**
   * Creates an Err variant.
   *
   * When to use:
   * - To wrap an error value in a Result object.
   *
   * @param error The error to wrap.
   * @returns An Err result containing the error.
   *
   * @example
   * const res = Result.err(new Error("failure")); // Result<never, Error>
   */
  err: <E>(error: E): Result<never, E> => ({ ok: false, error }),

  /**
   * Type guard for Ok variant.
   *
   * When to use:
   * - To narrow a Result type to Ok in conditional blocks.
   *
   * @param res The result to check.
   * @returns True if the result is Ok.
   *
   * @example
   * if (Result.isOk(res)) {
   *   console.log(res.value);
   * }
   */
  isOk: <T, E>(res: Result<T, E>): res is Ok<T> => isResult(res) && res.ok,

  /**
   * Type guard for Err variant.
   *
   * When to use:
   * - To narrow a Result type to Err in conditional blocks.
   *
   * @param res The result to check.
   * @returns True if the result is Err.
   *
   * @example
   * if (Result.isErr(res)) {
   *   console.error(res.error);
   * }
   */
  isErr: <T, E>(res: Result<T, E>): res is Err<E> => isResult(res) && !res.ok,

  /**
   * Returns the value if Ok, otherwise throws the error as-is.
   *
   * When to use:
   * - When you are certain the result is Ok or want to halt execution on error.
   *
   * @param res The result to unwrap.
   * @returns The value if Ok.
   * @throws The error if Err.
   *
   * @example
   * const val = Result.unwrap(Result.ok(1)); // 1
   */
  unwrap: <T, E>(res: Result<T, E>): T => {
    if (res.ok) return res.value;
    throw res.error;
  },

  /**
   * Returns value if Ok, otherwise returns fallback.
   *
   * When to use:
   * - When you want to provide a default value for failed operations.
   *
   * @param res The result to unwrap.
   * @param fallback The default value.
   * @returns The value if Ok, otherwise the fallback.
   *
   * @example
   * const val = Result.unwrapOr(Result.err("error"), 0); // 0
   */
  unwrapOr: <T, E>(res: Result<T, E>, fallback: T): T => (res.ok ? res.value : fallback),

  /**
   * Returns value if Ok, otherwise returns result of fallback function.
   *
   * When to use:
   * - When computing the fallback value is expensive and should be deferred.
   *
   * @param res The result to unwrap.
   * @param fn The function to compute fallback.
   * @returns The value if Ok, otherwise the result of fn.
   *
   * @example
   * const val = Result.unwrapOrElse(Result.err("e"), (e) => e.length); // 1
   */
  unwrapOrElse: <T, E>(res: Result<T, E>, fn: (err: E) => T): T =>
    res.ok ? res.value : fn(res.error),

  /**
   * Maps the successful value to a new one.
   *
   * When to use:
   * - To transform the value inside a Result without checking for error.
   *
   * @param res The result to map.
   * @param fn The transformation function.
   * @returns A new Result with the transformed value or original error.
   *
   * @example
   * const res = Result.map(Result.ok(1), (n) => n + 1); // Ok(2)
   */
  map: <T, E, U>(res: Result<T, E>, fn: (val: T) => U): Result<U, E> =>
    res.ok ? { ok: true, value: fn(res.value) } : res,

  /**
   * Maps the error value to a new one.
   *
   * When to use:
   * - To transform or wrap an error for better context.
   *
   * @param res The result to map.
   * @param fn The error transformation function.
   * @returns A new Result with the original value or transformed error.
   *
   * @example
   * const res = Result.mapErr(Result.err("fail"), (e) => new Error(e));
   */
  mapErr: <T, E, F>(res: Result<T, E>, fn: (err: E) => F): Result<T, F> =>
    res.ok ? res : { ok: false, error: fn(res.error) },

  /**
   * Chains successful results (Monadic bind).
   *
   * When to use:
   * - To sequence operations where each step returns a Result.
   *
   * @param res The result to chain.
   * @param fn Function that returns a new Result.
   * @returns The result of fn or the original error.
   *
   * @example
   * const res = Result.andThen(Result.ok(1), (n) => Result.ok(n + 1)); // Ok(2)
   */
  andThen: <T, E, U, F = E>(res: Result<T, E>, fn: (val: T) => Result<U, F>): Result<U, E | F> =>
    res.ok ? fn(res.value) : res,

  /**
   * Performs a side-effect if Ok.
   *
   * When to use:
   * - For logging, analytics, or other non-transforming actions on success.
   *
   * @param res The result.
   * @param fn The side-effect function.
   * @returns The original result.
   *
   * @example
   * Result.tap(Result.ok(1), (v) => console.log(v));
   */
  tap: <T, E>(res: Result<T, E>, fn: (val: T) => void): Result<T, E> => {
    if (res.ok) fn(res.value);
    return res;
  },

  /**
   * Performs a side-effect if Err.
   *
   * When to use:
   * - For error logging or alerting without interrupting the pipeline.
   *
   * @param res The result.
   * @param fn The side-effect function.
   * @returns The original result.
   *
   * @example
   * Result.tapErr(Result.err("e"), (e) => console.error(e));
   */
  tapErr: <T, E>(res: Result<T, E>, fn: (err: E) => void): Result<T, E> => {
    if (!res.ok) fn(res.error);
    return res;
  },

  /**
   * Type guard to check if a value is a Result object.
   *
   * When to use:
   * - When dealing with unknown values that might be Result objects.
   *
   * @param val The value to check.
   * @returns True if the value conforms to the Result structure.
   */
  isResult,

  /**
   * Converts Result to Option.
   *
   * When to use:
   * - When you want to discard the error and only care about the potential value.
   *
   * @param res The result to convert.
   * @returns Some(value) if Ok, otherwise None.
   */
  toOption: <T, E>(res: Result<T, E>): Option<T> => (res.ok ? Some(res.value) : None),

  /**
   * Pattern matches on the result variants.
   *
   * When to use:
   * - To handle both Ok and Err cases simultaneously.
   *
   * @param res The result to match.
   * @param matcher Object containing ok and err handlers.
   * @returns The result of the executed handler.
   *
   * @example
   * const msg = Result.match(res, {
   *   ok: (v) => `Value: ${v}`,
   *   err: (e) => `Error: ${e}`
   * });
   */
  match: <T, E, U>(res: Result<T, E>, matcher: { ok: (val: T) => U; err: (err: E) => U }): U =>
    res.ok ? matcher.ok(res.value) : matcher.err(res.error),

  /**
   * Semantic equality check.
   * Supports custom comparators for deep equality checks.
   *
   * When to use:
   * - To compare two Result objects for structural or semantic equality.
   *
   * @param a First result.
   * @param b Second result.
   * @param eqValue Optional custom value comparator.
   * @param eqError Optional custom error comparator.
   * @returns True if both results are of the same variant and their contents are equal.
   */
  equals: <T, E>(
    a: Result<T, E>,
    b: Result<T, E>,
    eqValue: (va: T, vb: T) => boolean = (va, vb) => va === vb,
    eqError: (ea: E, eb: E) => boolean = (ea, eb) => ea === eb
  ): boolean => {
    if (a.ok && b.ok) return eqValue(a.value, b.value);
    if (!a.ok && !b.ok) return eqError(a.error, b.error);
    return false;
  },

  /**
   * String representation of the result.
   *
   * When to use:
   * - Primarily for debugging and logging purposes.
   */
  format: <T, E>(res: Result<T, E>): string =>
    res.ok ? `Ok(${String(res.value)})` : `Err(${String(res.error)})`,

  /**
   * Aggregates an array of Results into a single Result of array.
   *
   * When to use:
   * - When you need all operations in a list to succeed.
   *
   * @param results Array of Results.
   * @returns Ok with array of values if all are Ok, otherwise the first Err encountered.
   *
   * @example
   * const res = Result.all([Result.ok(1), Result.ok(2)]); // Ok([1, 2])
   */
  all: <T, E>(results: Result<T, E>[]): Result<T[], E> => {
    const values: T[] = [];
    for (const r of results) {
      if (!r.ok) return r;
      values.push(r.value);
    }
    return { ok: true, value: values };
  },

  /**
   * Converts a Promise/Thenable into a Promise resolving to a Result.
   *
   * When to use:
   * - To bridge promise-based async code with the Result pattern.
   *
   * @param promise The promise to wrap.
   * @returns A promise that always resolves to a Result.
   *
   * @example
   * const res = await Result.fromPromise(fetch("/api"));
   */
  fromPromise: <T, E = Error>(promise: PromiseLike<T>): Promise<Result<T, E>> => {
    return Promise.resolve(promise).then(
      (value) => ({ ok: true, value }) as Result<T, E>,
      (error) => ({ ok: false, error: capture<E>(error) }) as Result<T, E>
    );
  },

  /**
   * Executes a function and captures any thrown error as Result.
   * Automatically handles both synchronous and asynchronous functions.
   *
   * When to use:
   * - To wrap potentially throwing functions in a safe Result container.
   *
   * @param fn The function to execute.
   * @returns A Result (or Promise of Result) containing the value or captured error.
   *
   * @example
   * const res = Result.tryCatch(() => JSON.parse(str));
   */
  tryCatch: <T, E = Error>(
    fn: () => T
  ): T extends PromiseLike<infer U> ? Promise<Result<U, E>> : Result<T, E> => {
    type TryCatchReturn = T extends PromiseLike<infer U> ? Promise<Result<U, E>> : Result<T, E>;
    try {
      const val = fn();
      if (isPromise(val)) {
        return (val as PromiseLike<unknown>).then(
          (v: unknown) => ({ ok: true, value: v }) as Result<unknown, E>,
          (e: unknown) => ({ ok: false, error: capture<E>(e) }) as Result<unknown, E>
        ) as unknown as TryCatchReturn;
      }
      return { ok: true, value: val } as unknown as TryCatchReturn;
    } catch (e) {
      return { ok: false, error: capture<E>(e) } as unknown as TryCatchReturn;
    }
  },
};

/**
 * Factory for creating Ok results. Alias for {@link Result.ok}.
 *
 * @example
 * const res = Ok(10);
 */
export const Ok = Result.ok;

/**
 * Factory for creating Err results. Alias for {@link Result.err}.
 *
 * @example
 * const res = Err(new Error("failure"));
 */
export const Err = Result.err;

/**
 * Executes a function and captures any thrown error. Alias for {@link Result.tryCatch}.
 *
 * @example
 * const res = tryCatch(() => JSON.parse("{"));
 */
export const tryCatch = Result.tryCatch;

/**
 * Converts a promise to a Result. Alias for {@link Result.fromPromise}.
 *
 * @example
 * const res = await fromPromise(fetch("/api"));
 */
export const fromPromise = Result.fromPromise;
