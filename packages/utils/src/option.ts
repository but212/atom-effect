import { isOption } from './type-guard';

export type Option<T> = Some<T> | None<T>;

export interface OptionMethods<T> extends Iterable<T> {
  isSome(): this is Some<T>;
  isNone(): this is None<T>;
  unwrap(): T;
  unwrapOr<U>(fallback: U): T | U;
  unwrapOrElse<U>(fn: () => U): T | U;
  map<U>(fn: (val: T) => U): Option<U>;
  andThen<U>(fn: (val: T) => Option<U>): Option<U>;
  filter<U extends T>(predicate: (val: T) => val is U): Option<U>;
  filter(predicate: (val: T) => boolean): Option<T>;
  match<R>(matcher: { some: (val: T) => R; none: () => R }): R;
  equals(other: unknown): boolean;
  toNullable(): T | null;
  toUndefined(): T | undefined;
  toString(): string;
}

/**
 * Some<T> represents a value that is present.
 */
export interface Some<T> extends OptionMethods<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * None represents the absence of a value.
 */
export interface None<T = never> extends OptionMethods<T> {
  readonly ok: false;
}

class SomeImpl<T> implements Some<T> {
  readonly ok = true as const;
  constructor(readonly value: T) {}

  isSome(): this is Some<T> {
    return true;
  }
  isNone(): this is None<T> {
    return false;
  }
  unwrap(): T {
    return this.value;
  }
  unwrapOr<U>(_fallback: U): T | U {
    return this.value;
  }
  unwrapOrElse<U>(_fn: () => U): T | U {
    return this.value;
  }
  map<U>(fn: (val: T) => U): Option<U> {
    return Some(fn(this.value));
  }
  andThen<U>(fn: (val: T) => Option<U>): Option<U> {
    return fn(this.value);
  }

  filter<U extends T>(predicate: (val: T) => val is U): Option<U>;
  filter(predicate: (val: T) => boolean): Option<T>;
  filter<U extends T>(predicate: (val: T) => boolean): Option<U> {
    return predicate(this.value) ? (this as unknown as Option<U>) : (None as unknown as Option<U>);
  }

  match<R>(matcher: { some: (val: T) => R; none: () => R }): R {
    return matcher.some(this.value);
  }

  equals(other: unknown): boolean {
    return isOption(other) && other.ok && (other as Some<unknown>).value === this.value;
  }

  toNullable(): T {
    return this.value;
  }
  toUndefined(): T {
    return this.value;
  }

  toString(): string {
    return `Some(${String(this.value)})`;
  }
  get [Symbol.toStringTag]() {
    return 'Some';
  }

  *[Symbol.iterator](): Generator<T, void, undefined> {
    yield this.value;
  }
}

class NoneImpl<T = never> implements None<T> {
  readonly ok = false as const;

  isSome(): this is Some<T> {
    return false;
  }
  isNone(): this is None<T> {
    return true;
  }
  unwrap(): T {
    throw new Error('Option.unwrap() on None');
  }
  unwrapOr<U>(fallback: U): T | U {
    return fallback;
  }
  unwrapOrElse<U>(fn: () => U): T | U {
    return fn();
  }
  map<U>(_fn: (val: T) => U): Option<U> {
    return this as unknown as Option<U>;
  }
  andThen<U>(_fn: (val: T) => Option<U>): Option<U> {
    return this as unknown as Option<U>;
  }

  filter<U extends T>(predicate: (val: T) => val is U): Option<U>;
  filter(predicate: (val: T) => boolean): Option<T>;
  filter<U extends T>(_predicate: (val: T) => boolean): Option<U> {
    return this as unknown as Option<U>;
  }

  match<R>(matcher: { some: (val: T) => R; none: () => R }): R {
    return matcher.none();
  }

  equals(other: unknown): boolean {
    return isOption(other) && !other.ok;
  }

  toNullable(): null {
    return null;
  }
  toUndefined(): undefined {
    return undefined;
  }

  toString(): string {
    return 'None';
  }
  get [Symbol.toStringTag]() {
    return 'None';
  }

  *[Symbol.iterator](): Generator<T, void, undefined> {}
}

/**
 * Creates an Option holding a value.
 */
export const Some = <T>(value: T): Option<T> => new SomeImpl(value);

/**
 * Represents the absence of a value.
 */
export const None: Option<never> = new NoneImpl<never>();

/**
 * Converts a nullable value (T | null | undefined) into an Option<T>.
 */
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value == null ? (None as Option<T>) : Some(value);
