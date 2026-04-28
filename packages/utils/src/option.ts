export type Option<T> = OptionMethods<T> & (Some<T> | None);

export interface OptionMethods<T> {
  isSome(): this is Some<T>;
  isNone(): this is None;
  unwrap(): T;
  unwrapOr(fallback: T): T;
  unwrapOrElse(fn: () => T): T;
  map<U>(fn: (val: T) => U): Option<U>;
  andThen<U>(fn: (val: T) => Option<U>): Option<U>;
  filter<U extends T>(predicate: (val: T) => val is U): Option<U>;
  filter(predicate: (val: T) => boolean): Option<T>;
  match<R>(matcher: { some: (val: T) => R; none: () => R }): R;
  equals(other: Option<unknown>): boolean;
  toNullable(): T | null;
  toUndefined(): T | undefined;
}

/**
 * Some<T> represents a value that is present.
 */
export interface Some<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * None represents the absence of a value.
 */
export interface None {
  readonly ok: false;
}

/**
 * Creates an Option holding a value.
 * Unlike fromNullable, this is a strict constructor that always returns Some(value).
 */
export function Some<T>(value: T): Option<T> {
  return new SomeImpl(value);
}

/** Internal implementation for None */
class NoneImpl implements OptionMethods<never>, None {
  readonly ok = false as const;

  isSome(): this is Some<never> {
    return false;
  }

  isNone(): this is None {
    return true;
  }

  unwrap(): never {
    throw new Error('Option.unwrap() on None');
  }

  unwrapOr<T>(fallback: T): T {
    return fallback;
  }

  unwrapOrElse<T>(fn: () => T): T {
    return fn();
  }

  map<U>(_fn: (val: never) => U): Option<never> {
    return this as unknown as Option<never>;
  }

  andThen<U>(_fn: (val: never) => Option<U>): Option<never> {
    return this as unknown as Option<never>;
  }

  filter<U extends never>(predicate: (val: never) => val is U): Option<U>;
  filter(predicate: (val: never) => boolean): Option<never>;
  filter(_predicate: (val: never) => boolean): Option<never> {
    return this as unknown as Option<never>;
  }

  match<R>(matcher: { some: (val: never) => R; none: () => R }): R {
    return matcher.none();
  }

  equals(other: Option<unknown>): boolean {
    return !other.ok;
  }

  toNullable(): null {
    return null;
  }

  toUndefined(): undefined {
    return undefined;
  }
}

/**
 * Represents the absence of a value.
 */
export const None: Option<never> = new NoneImpl() as unknown as Option<never>;

/** Internal implementation for Some */
class SomeImpl<T> implements OptionMethods<T>, Some<T> {
  readonly ok = true as const;
  constructor(readonly value: T) {}

  isSome(): this is Some<T> {
    return true;
  }

  isNone(): this is None {
    return false;
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_fallback: T): T {
    return this.value;
  }

  unwrapOrElse(_fn: () => T): T {
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

  equals(other: Option<unknown>): boolean {
    return other.ok && (other.unwrap() as unknown) === this.value;
  }

  toNullable(): T {
    return this.value;
  }

  toUndefined(): T {
    return this.value;
  }
}

/**
 * Converts a nullable value (T | null | undefined) into an Option<T>.
 */
export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value == null ? None : Some(value);
}
