/**
 * @module Option
 *
 * Responsibility:
 * Represents optional values type-safely to eliminate null reference errors.
 *
 * Design Intent:
 * Follows minimalist design principles by utilizing TypeScript's type narrowing,
 * eliminating runtime casting, and maintaining zero-overhead abstraction.
 */

import { OPTION_BRAND, OPTION_SYMBOL } from './symbols';

/**
 * Represents a present value of type T.
 *
 * When to use:
 * - When a value is computed or retrieved.
 */
export type Some<T> = {
  readonly ok: true;
  readonly value: T;
  readonly [OPTION_SYMBOL]: unknown;
};

/**
 * Represents the absence of a value.
 *
 * When to use:
 * - When a value is absent, unavailable, or deferred.
 */
export type None = {
  readonly ok: false;
  readonly value: undefined;
  readonly [OPTION_SYMBOL]: unknown;
};

/**
 * A discriminated union representing either a value ({@link Some})
 * or the absence of a value ({@link None}).
 *
 * When to use:
 * - For fields, returns, or parameters that may or may not contain a value.
 */
export type Option<T> = Some<T> | None;

/**
 * Checks if a value is a valid {@link Option} instance.
 *
 * When to use:
 * - To verify at runtime whether an unknown input conforms to the Option protocol.
 *
 * @param value - The value to check.
 * @returns True if the value is an Option, false otherwise.
 *
 * @example
 * const isOpt = isOption(Option.some(42)); // true
 */
export const isOption = (value: unknown): value is Option<unknown> =>
  !!value && typeof value === 'object' && (value as Record<symbol, unknown>)[OPTION_BRAND] === true;

// Logic: Asserts that a value is a valid Option instance. Used only at trust boundaries.
function assertOption(value: unknown): asserts value is Option<unknown> {
  if (!isOption(value)) {
    throw new Error('Invalid Option instance');
  }
}

function fromPredicate<T, U extends T>(value: T, predicate: (value: T) => value is U): Option<U>;
function fromPredicate<T>(value: T, predicate: (value: T) => boolean): Option<T>;
function fromPredicate(value: unknown, predicate: (value: unknown) => boolean): Option<unknown> {
  return predicate(value) ? Option.some(value) : Option.none;
}

/**
 * Utilities for creating, transforming, and querying {@link Option} instances.
 */
export const Option = {
  /**
   * Creates an Option containing a value.
   *
   * When to use:
   * - To wrap a present value into an Option type.
   *
   * @param value - The value to wrap.
   * @returns A Some instance holding the value.
   *
   * @example
   * const opt = Option.some(42);
   */
  some: <T>(value: T): Some<T> =>
    ({ ok: true, value, [OPTION_SYMBOL]: true, [OPTION_BRAND]: true }) as Some<T>,

  /**
   * An Option instance representing the absence of a value.
   *
   * When to use:
   * - To return or assign an absent state.
   *
   * @example
   * const opt = Option.none;
   */
  // Optimization: Freezes the None object to enforce immutability and allow safe sharing.
  none: Object.freeze({
    ok: false,
    value: undefined,
    [OPTION_SYMBOL]: true,
    [OPTION_BRAND]: true,
  } as const) as None,

  /**
   * Checks if an Option contains a value.
   *
   * When to use:
   * - As a type guard to narrow the type to Some.
   *
   * @param option - The Option to check.
   * @returns True if the Option is Some.
   *
   * @example
   * if (Option.isSome(opt)) {
   *   console.log(opt.value);
   * }
   */
  isSome: <T>(option: Option<T>): option is Some<T> => option.ok,

  /**
   * Checks if an Option is empty.
   *
   * When to use:
   * - As a type guard to narrow the type to None.
   *
   * @param option - The Option to check.
   * @returns True if the Option is None.
   *
   * @example
   * if (Option.isNone(opt)) {
   *   console.log("Empty");
   * }
   */
  isNone: <T>(option: Option<T>): option is None => !option.ok,

  /**
   * Returns the value of a Some, or throws a defined error if it is None.
   *
   * When to use:
   * - When a value must be present, raising an error otherwise.
   *
   * @param option - The Option to extract the value from.
   * @param message - The error message to throw.
   * @returns The inner value of Some.
   * @throws {Error} If the Option is None.
   *
   * @example
   * const val = Option.expect(opt, "Value must be present");
   */
  expect: <T>(option: Option<T>, message: string): T => {
    if (option.ok) return option.value;
    throw new Error(message);
  },

  /**
   * Extracts the inner value of a Some, or throws a default error if it is None.
   *
   * When to use:
   * - For assertion-style extraction when failure indicates a logic bug.
   *
   * @param option - The Option to extract the value from.
   * @returns The inner value of Some.
   * @throws {Error} If the Option is None.
   *
   * @example
   * const val = Option.unwrap(opt);
   */
  unwrap: <T>(option: Option<T>): T => Option.expect(option, 'Option.unwrap() on None'),

  /**
   * Returns the inner value if present, otherwise returns a fallback value.
   *
   * When to use:
   * - To retrieve the value with a static fallback.
   *
   * @param option - The Option to extract the value from.
   * @param fallback - The default value to use if None.
   * @returns The inner value of Some, or the fallback.
   *
   * @example
   * const val = Option.unwrapOr(opt, 0);
   */
  unwrapOr: <T, U>(option: Option<T>, fallback: U): T | U => (option.ok ? option.value : fallback),

  /**
   * Returns the inner value if present, otherwise computes a fallback value.
   *
   * @remarks
   * The fallback function is evaluated lazily, running only when the Option is None.
   *
   * When to use:
   * - To retrieve the value with a lazily computed fallback.
   *
   * @param option - The Option to extract the value from.
   * @param fallbackProvider - A function that computes the fallback value.
   * @returns The inner value of Some, or the computed fallback.
   *
   * @example
   * const val = Option.unwrapOrElse(opt, () => computeDefault());
   */
  unwrapOrElse: <T, U>(option: Option<T>, fallbackProvider: () => U): T | U =>
    option.ok ? option.value : fallbackProvider(),

  /**
   * Transforms the inner value using the provided function if present.
   *
   * @remarks
   * If the Option is None, it returns None. If the mapping function returns the same value
   * (determined by `Object.is`), the original Option instance is reused to optimize memory.
   *
   * When to use:
   * - To perform operations on the value without verifying presence first.
   *
   * @param option - The Option to map.
   * @param mapper - The function to apply to the inner value.
   * @returns A new Option containing the transformed value, or None.
   *
   * @example
   * const opt2 = Option.map(opt1, x => x * 2);
   */
  map: <T, U>(option: Option<T>, mapper: (value: T) => U): Option<U> => {
    if (!option.ok) return option;
    const mappedValue = mapper(option.value);
    return Object.is(mappedValue, option.value) &&
      (mappedValue === null ||
        (typeof mappedValue !== 'object' && typeof mappedValue !== 'function') ||
        Object.isFrozen(mappedValue))
      ? (option as unknown as Option<U>)
      : Option.some(mappedValue);
  },

  /**
   * Chains a function that returns another Option.
   *
   * When to use:
   * - To compose multiple operations that may each return an Option.
   *
   * @param option - The Option to chain.
   * @param mapper - The function returning an Option.
   * @returns The resulting Option from the function, or None.
   *
   * @example
   * const opt2 = Option.andThen(opt1, x => findUser(x));
   */
  andThen: <T, U>(option: Option<T>, mapper: (value: T) => Option<U>): Option<U> => {
    if (!option.ok) return option;
    const mapped = mapper(option.value);
    assertOption(mapped);
    return mapped;
  },

  /**
   * Creates an Option from a value that may be null or undefined.
   *
   * When to use:
   * - To convert external nullable values into Option instances.
   *
   * @param value - The value to normalize.
   * @returns Some if the value is non-nullable, otherwise None.
   *
   * @example
   * const opt = Option.fromNullable(apiResponse.user);
   */
  fromNullable: <T>(value: T | null | undefined): Option<T> =>
    value == null ? Option.none : Option.some(value),

  /**
   * Executes a branch handler based on whether the Option contains a value.
   *
   * When to use:
   * - To perform conditional logic for both cases of an Option.
   *
   * @param option - The Option to match.
   * @param branches - The handlers for Some and None.
   * @returns The value returned by the executed branch.
   *
   * @example
   * const res = Option.match(opt, {
   *   some: v => `User: ${v}`,
   *   none: () => 'Guest'
   * });
   */
  match: <T, R>(option: Option<T>, branches: { some: (value: T) => R; none: () => R }): R =>
    option.ok ? branches.some(option.value) : branches.none(),

  /**
   * Returns None if the inner value does not satisfy the predicate.
   *
   * When to use:
   * - To filter a wrapped value based on a condition.
   *
   * @param option - The Option to filter.
   * @param predicate - The condition to test the value against.
   * @returns The Option if the predicate is met, otherwise None.
   *
   * @example
   * const positiveOpt = Option.filter(opt, x => x > 0);
   */
  filter: <T>(option: Option<T>, predicate: (value: T) => boolean): Option<T> =>
    option.ok && predicate(option.value) ? option : Option.none,

  /**
   * Checks for structural and value equality between two Options.
   *
   * @remarks
   * Performs a strict equality check using `Object.is` for Some values. Throws
   * an error if either input is not a valid Option instance.
   *
   * When to use:
   * - To compare two Option states for equivalence.
   *
   * @param optionA - The first Option to compare.
   * @param optionB - The second Option to compare.
   * @returns True if both Options represent the same state and value.
   *
   * @example
   * const equal = Option.equals(optA, optB);
   */
  equals: <T>(optionA: Option<T>, optionB: Option<T>): boolean => {
    if (!isOption(optionA) || !isOption(optionB)) return false;
    // Logic: Fast-paths identical references before performing checks.
    if (optionA === optionB) return true;
    // Logic: Narrows the types of both options to Some before accessing their values.
    return optionA.ok && optionB.ok
      ? Object.is(optionA.value, optionB.value)
      : optionA.ok === optionB.ok;
  },

  /**
   * Converts an Option to a nullable representation.
   *
   * When to use:
   * - When interacting with legacy APIs that expect null.
   *
   * @param option - The Option to convert.
   * @returns The inner value of Some, or null.
   *
   * @example
   * const val = Option.toNullable(opt);
   */
  toNullable: <T>(option: Option<T>): T | null => (option.ok ? option.value : null),

  /**
   * Converts an Option to an undefined representation.
   *
   * When to use:
   * - When interacting with legacy APIs that expect undefined.
   *
   * @param option - The Option to convert.
   * @returns The inner value of Some, or undefined.
   *
   * @example
   * const val = Option.toUndefined(opt);
   */
  toUndefined: <T>(option: Option<T>): T | undefined => (option.ok ? option.value : undefined),

  /**
   * Combines an array of Options into a single Option containing an array of values.
   *
   * If any Option is None, it returns None.
   *
   * @param options - An array of Option instances.
   * @returns Option containing an array of values, or None.
   *
   * @example
   * const combined = Option.all([Option.some(1), Option.some(2)]); // Some([1, 2])
   */
  all: <T>(options: Option<T>[]): Option<T[]> => {
    const result: T[] = [];
    for (const opt of options) {
      if (Option.isNone(opt)) return Option.none;
      result.push(opt.value);
    }
    return Option.some(result);
  },

  /**
   * Creates an Option from a value based on a predicate function.
   *
   * If the predicate evaluates to true, it returns Some wrapping the value.
   * Otherwise, it returns None.
   *
   * @param value - The value to evaluate.
   * @param predicate - The condition function.
   * @returns Option wrapping the value, or None.
   *
   * @example
   * const opt = Option.fromPredicate(42, x => x > 0); // Some(42)
   */
  fromPredicate,
};
