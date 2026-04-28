import { None, type Option, Some } from '@/option';

/**
 * Result represents a value that is either a success (Ok) or a failure (Err).
 */
export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

/**
 * Ok<T, E> represents a value that is present.
 */
export interface Ok<T, E> {
  readonly ok: true;
  readonly value: T;
  isOk(): this is Ok<T, E>;
  isErr(): this is Err<T, E>;
  unwrap(): T;
  unwrapOr(fallback: T): T;
  unwrapOrElse(fn: (err: E) => T): T;
  map<U>(fn: (val: T) => U): Result<U, E>;
  mapErr<F>(fn: (err: E) => F): Result<T, F>;
  andThen<U>(fn: (val: T) => Result<U, E>): Result<U, E>;
  toOption(): Option<T>;
  match<U>(onOk: (val: T) => U, onErr: (err: E) => U): U;
}

/**
 * Err<T, E> represents a value that is not present.
 */
export interface Err<T, E> {
  readonly ok: false;
  readonly error: E;
  isOk(): this is Ok<T, E>;
  isErr(): this is Err<T, E>;
  unwrap(): never;
  unwrapOr(fallback: T): T;
  unwrapOrElse(fn: (err: E) => T): T;
  map<U>(fn: (val: T) => U): Result<U, E>;
  mapErr<F>(fn: (err: E) => F): Result<T, F>;
  andThen<U>(fn: (val: T) => Result<U, E>): Result<U, E>;
  toOption(): Option<T>;
  match<U>(onOk: (val: T) => U, onErr: (err: E) => U): U;
}

/** Rule 4: Simple but robust error normalization for unwrap() */
const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** Rule 5: Ensure captured data matches expected error type (E) */
const capture = <E>(e: unknown): E => e as E;

/**
 * Robustly identify Promise instances while avoiding false positives for thenable DSLs.
 */
const isPromise = (val: unknown): val is Promise<unknown> =>
  val instanceof Promise ||
  (val !== null &&
    typeof val === 'object' &&
    Object.prototype.toString.call(val) === '[object Promise]');

/** Internal implementation for Ok */
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
  unwrapOr(_fallback: T): T {
    return this.value;
  }
  unwrapOrElse(_fn: (err: E) => T): T {
    return this.value;
  }

  map<U>(fn: (val: T) => U): Result<U, E> {
    return Ok(fn(this.value));
  }

  mapErr<F>(_fn: (err: E) => F): Result<T, F> {
    return Ok(this.value);
  }

  andThen<U>(fn: (val: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }

  toOption(): Option<T> {
    return Some(this.value);
  }

  match<U>(onOk: (val: T) => U, _onErr: (err: E) => U): U {
    return onOk(this.value);
  }
}

/** Internal implementation for Err */
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

  map<U>(_fn: (val: T) => U): Result<U, E> {
    return Err(this.error);
  }

  mapErr<F>(fn: (err: E) => F): Result<T, F> {
    return Err(fn(this.error));
  }

  andThen<U>(_fn: (val: T) => Result<U, E>): Result<U, E> {
    return Err(this.error);
  }

  toOption(): Option<T> {
    return None;
  }

  match<U>(_onOk: (val: T) => U, onErr: (err: E) => U): U {
    return onErr(this.error);
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
export function tryCatch<T, E = Error>(
  fn: () => unknown
): Result<unknown, E> | Promise<Result<unknown, E>> {
  try {
    const val = fn();
    if (isPromise(val)) {
      return (val as Promise<T>).then((v) => Ok(v)).catch((e) => Err(capture<E>(e)));
    }
    return Ok(val as T);
  } catch (e) {
    return Err(capture<E>(e));
  }
}
