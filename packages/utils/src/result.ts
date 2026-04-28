import { None, type Option, Some } from '@/option';

/**
 * Result represents a value that is either a success (Ok) or a failure (Err).
 */
export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

export interface ResultMethods<T, E> {
  isOk(): this is Ok<T, E>;
  isErr(): this is Err<T, E>;
  unwrap(): T;
  unwrapOr(fallback: T): T;
  unwrapOrElse(fn: (err: E) => T): T;
  map<U>(fn: (val: T) => U): Result<U, E>;
  mapErr<F>(fn: (err: E) => F): Result<T, F>;
  andThen<U>(fn: (val: T) => Result<U, E>): Result<U, E>;
  toOption(): Option<T>;
  match<U>(matcher: { ok: (val: T) => U; err: (err: E) => U }): U;
}

/**
 * Ok<T, E> represents a value that is present.
 */
export interface Ok<T, E> extends ResultMethods<T, E> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Err<T, E> represents a value that is not present.
 */
export interface Err<T, E> extends ResultMethods<T, E> {
  readonly ok: false;
  readonly error: E;
}

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));
const capture = <E>(e: unknown): E => e as E;

const isPromise = (val: unknown): val is PromiseLike<unknown> =>
  val !== null &&
  (typeof val === 'object' || typeof val === 'function') &&
  typeof (val as Record<'then', unknown>).then === 'function';

class OkImpl<T, E> implements Ok<T, E> {
  readonly ok = true as const;
  constructor(readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true;
  }
  isErr(): this is Err<T, E> {
    return false;
  }
  unwrap(): T {
    return this.value;
  }
  unwrapOr(): T {
    return this.value;
  }
  unwrapOrElse(): T {
    return this.value;
  }
  map<U>(fn: (val: T) => U): Result<U, E> {
    return Ok(fn(this.value));
  }
  mapErr<F>(): Result<T, F> {
    return Ok(this.value);
  }
  andThen<U>(fn: (val: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }
  toOption(): Option<T> {
    return Some(this.value);
  }
  match<U>(matcher: { ok: (val: T) => U; err: (err: E) => U }): U {
    return matcher.ok(this.value);
  }
}

class ErrImpl<T, E> implements Err<T, E> {
  readonly ok = false as const;
  constructor(readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false;
  }
  isErr(): this is Err<T, E> {
    return true;
  }
  unwrap(): never {
    throw toError(this.error);
  }
  unwrapOr(fallback: T): T {
    return fallback;
  }
  unwrapOrElse(fn: (err: E) => T): T {
    return fn(this.error);
  }
  map<U>(): Result<U, E> {
    return Err(this.error);
  }
  mapErr<F>(fn: (err: E) => F): Result<T, F> {
    return Err(fn(this.error));
  }
  andThen<U>(): Result<U, E> {
    return Err(this.error);
  }
  toOption(): Option<T> {
    return None;
  }
  match<U>(matcher: { ok: (val: T) => U; err: (err: E) => U }): U {
    return matcher.err(this.error);
  }
}

/** Ok factory */
export const Ok = <T, E = never>(value: T): Ok<T, E> => new OkImpl(value);

/** Err factory */
export const Err = <T = never, E = Error>(error: E): Err<T, E> => new ErrImpl(error);

/** Executes a function and captures any thrown error. Handles both sync and async functions. */
export function tryCatch<T, E = Error>(
  fn: () => T extends PromiseLike<unknown> ? never : T
): Result<T, E>;
export function tryCatch<T, E = Error>(fn: () => Promise<T>): Promise<Result<T, E>>;
export function tryCatch<_, E = Error>(
  fn: () => unknown
): Result<unknown, E> | Promise<Result<unknown, E>> {
  try {
    const val = fn();
    if (isPromise(val)) {
      return Promise.resolve(val).then(
        (v) => Ok(v),
        (e) => Err(capture<E>(e))
      );
    }
    return Ok(val);
  } catch (e) {
    const error = Err<unknown, E>(capture<E>(e));
    return fn.constructor.name === 'AsyncFunction' ||
      (fn as { [Symbol.toStringTag]?: string })[Symbol.toStringTag] === 'AsyncFunction'
      ? Promise.resolve(error)
      : error;
  }
}
