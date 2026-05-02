import { RESULT_SYMBOL } from './symbols';

/**
 * Represents a successful computation result.
 *
 * When to use:
 * - When you need to return a value explicitly marked as successful.
 */
export type Ok<T> = {
  readonly ok: true;
  readonly value: T;
  readonly [RESULT_SYMBOL]: true;
};

/**
 * Represents a failed computation result.
 *
 * When to use:
 * - When an operation fails and you want to pass error data without throwing.
 */
export type Err<E> = {
  readonly ok: false;
  readonly error: E;
  readonly [RESULT_SYMBOL]: true;
};

/**
 * A discriminated union representing success (Ok) or failure (Err).
 *
 * When to use:
 * - As a return type for any function that can fail under normal conditions
 *   (e.g., validation, API calls, parsing).
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Utilities for creating and consuming Result types.
 */
export const Result = {
  /**
   * Creates a successful Result.
   */
  ok: <T>(value: T): Result<T, never> => ({
    ok: true as const,
    value,
    [RESULT_SYMBOL]: true,
  }),

  /**
   * Creates a failed Result.
   */
  err: <E>(error: E): Result<never, E> => ({
    ok: false as const,
    error,
    [RESULT_SYMBOL]: true,
  }),

  /**
   * Exhaustively handles both possible states of a Result.
   *
   * When to use:
   * - This is the recommended way to consume a Result, as it forces the developer
   *   to handle the error case, preventing "forgotten" error checks.
   *
   * @example
   * const res = Result.ok(42);
   * const text = Result.match(res, {
   *   ok: (val) => `Value is ${val}`,
   *   err: (err) => `Failed: ${err.message}`
   * });
   */
  match: <T, E, R>(res: Result<T, E>, matcher: { ok: (val: T) => R; err: (err: E) => R }): R =>
    res.ok ? matcher.ok(res.value) : matcher.err(res.error),

  /**
   * Wraps a synchronous function call that might throw an exception.
   *
   * When to use:
   * - When integrating with third-party libraries or legacy code that uses `throw`.
   * - When performing operations like `JSON.parse` that are not safe by default.
   *
   * @example
   * const res = Result.tryCatch(() => JSON.parse('{ invalid }'));
   * if (!res.ok) console.error("Parse failed:", res.error);
   */
  tryCatch: <T, E = Error>(fn: () => T): Result<T, E> => {
    try {
      return { ok: true as const, value: fn(), [RESULT_SYMBOL]: true };
    } catch (e) {
      return { ok: false as const, error: e as E, [RESULT_SYMBOL]: true };
    }
  },

  /**
   * Wraps an asynchronous operation into a Result-bearing Promise.
   *
   * When to use:
   * - When performing I/O, network requests, or timers that might reject.
   *
   * @example
   * const res = await Result.tryAsync(() => fetch('/api/user'));
   * Result.match(res, {
   *   ok: (response) => console.log("Success"),
   *   err: (err) => console.error("Network error")
   * });
   */
  tryAsync: <T, E = Error>(fn: () => PromiseLike<T>): Promise<Result<T, E>> => {
    // Logic: Catching sync throws
    // We wrap the initial call in try-catch because fn() might throw
    // synchronously before even returning a Promise.
    try {
      const p = fn();
      // Optimization: Manual Promise orchestration
      // We avoid 'async/await' here to skip the microtask overhead of the
      // async state machine, resolving directly via .then().
      return Promise.resolve(p).then(
        (value) => ({ ok: true as const, value, [RESULT_SYMBOL]: true }),
        (error) => ({ ok: false as const, error: error as E, [RESULT_SYMBOL]: true })
      );
    } catch (e) {
      return Promise.resolve({ ok: false as const, error: e as E, [RESULT_SYMBOL]: true });
    }
  },
};
