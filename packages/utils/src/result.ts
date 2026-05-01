/**
 * Represents a successful computation result.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };

/**
 * Represents a failed computation result.
 */
export type Err<E> = { readonly ok: false; readonly error: E };

/**
 * Result Variant Types.
 * Data-centric tagged union where the 'ok' property acts as the explicit discriminant.
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Result Utilities.
 * Minimalist interface focusing on explicit data handling.
 */
export const Result = {
  /** Creates an Ok variant. */
  ok: <T>(value: T): Result<T, never> => ({ ok: true as const, value }),

  /** Creates an Err variant. */
  err: <E>(error: E): Result<never, E> => ({ ok: false as const, error }),

  /**
   * Explicitly handles both result states.
   * This is the primary way to consume a Result, ensuring all cases are handled.
   */
  match: <T, E, R>(res: Result<T, E>, matcher: { ok: (val: T) => R; err: (err: E) => R }): R =>
    res.ok ? matcher.ok(res.value) : matcher.err(res.error),

  /**
   * Captures a synchronous execution as a Result.
   */
  tryCatch: <T, E = Error>(fn: () => T): Result<T, E> => {
    try {
      return { ok: true as const, value: fn() };
    } catch (e) {
      return { ok: false as const, error: e as E };
    }
  },

  /**
   * Captures an asynchronous execution as a Result.
   * Optimized to avoid the overhead of the async/await state machine.
   */
  tryAsync: <T, E = Error>(fn: () => PromiseLike<T>): Promise<Result<T, E>> => {
    try {
      const p = fn();
      return Promise.resolve(p).then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error: error as E })
      );
    } catch (e) {
      return Promise.resolve({ ok: false as const, error: e as E });
    }
  },
};
