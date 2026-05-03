import { OPTION_SYMBOL } from './symbols';
import { isOption } from './type-guard';

/**
 * Represents a present value.
 */
export type Some<T> = {
  readonly ok: true;
  readonly value: T;
  readonly [OPTION_SYMBOL]: true;
};

/**
 * Represents the absence of a value.
 */
export type None = {
  readonly ok: false;
  readonly [OPTION_SYMBOL]: true;
};

/**
 * A discriminated union representing either a value ({@link Some})
 * or the absence of a value ({@link None}).
 */
export type Option<T> = Some<T> | None;

/**
 * Utilities for creating and consuming Option types.
 */
export const Option = {
  /**
   * Creates a {@link Some} instance holding a non-nullable value.
   */
  some: <T>(value: T): Some<T> => ({
    ok: true,
    value,
    [OPTION_SYMBOL]: true,
  }),

  /**
   * A constant representing the absence of a value.
   */
  none: {
    ok: false,
    [OPTION_SYMBOL]: true,
  } as None,

  /**
   * Type guard to check if an {@link Option} contains a value.
   */
  isSome: <T>(opt: Option<T>): opt is Some<T> => opt.ok,

  /**
   * Type guard to check if an {@link Option} is empty.
   */
  isNone: <T>(opt: Option<T>): opt is None => !opt.ok,

  /**
   * Returns the value if present, otherwise throws an error with the provided message.
   */
  expect: <T>(opt: Option<T>, message: string): T => {
    if (opt.ok) return opt.value;
    throw new Error(message);
  },

  /**
   * Extracts the inner value if present.
   */
  unwrap: <T>(opt: Option<T>): T => {
    if (!opt.ok) throw new Error('Option.unwrap() on None');
    return opt.value;
  },

  /**
   * Returns the inner value if present, otherwise returns a fallback value.
   */
  unwrapOr: <T, U>(opt: Option<T>, fallback: U): T | U => (opt.ok ? opt.value : fallback),

  /**
   * Returns the inner value if present, otherwise computes a fallback value.
   */
  unwrapOrElse: <T, U>(opt: Option<T>, fn: () => U): T | U => (opt.ok ? opt.value : fn()),

  /**
   * Transforms the inner value using the provided function if present.
   */
  map: <T, U>(opt: Option<T>, fn: (val: T) => U): Option<U> => {
    if (!opt.ok) return opt as unknown as Option<U>;
    const newValue = fn(opt.value);
    return (newValue as unknown as T) === opt.value
      ? (opt as unknown as Option<U>)
      : Option.some(newValue);
  },

  /**
   * Chains a function that returns another {@link Option}.
   */
  andThen: <T, U>(opt: Option<T>, fn: (val: T) => Option<U>): Option<U> =>
    opt.ok ? fn(opt.value) : (opt as unknown as Option<U>),

  /**
   * Creates an {@link Option} from a value that might be `null` or `undefined`.
   */
  fromNullable: <T>(value: T | null | undefined): Option<T> =>
    value == null ? Option.none : Option.some(value),

  /**
   * Executes a branch handler based on whether the option is {@link Some} or {@link None}.
   */
  match: <T, R>(opt: Option<T>, branches: { some: (val: T) => R; none: () => R }): R =>
    opt.ok ? branches.some(opt.value) : branches.none(),

  /**
   * Returns {@link None} if the inner value does not satisfy the predicate.
   */
  filter: <T>(opt: Option<T>, predicate: (val: T) => boolean): Option<T> =>
    opt.ok && predicate(opt.value) ? opt : Option.none,

  /**
   * Checks for deep equality between two options.
   */
  equals: <T>(a: Option<T>, b: Option<T>): boolean => {
    if (a === b) return true;
    if (a.ok !== b.ok) return false;
    if (!isOption(a) || !isOption(b)) return false;
    return !a.ok || (a as Some<T>).value === (b as Some<T>).value;
  },

  /**
   * Converts an {@link Option} to a nullable type.
   */
  toNullable: <T>(opt: Option<T>): T | null => (opt.ok ? opt.value : null),

  /**
   * Converts an {@link Option} to an undefined type.
   */
  toUndefined: <T>(opt: Option<T>): T | undefined => (opt.ok ? opt.value : undefined),
};
