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

import { OPTION_SYMBOL } from './symbols';
import type { Prettify } from './types';

/**
 * Represents a present value of type T.
 *
 * When to use:
 * - When a value is computed or retrieved.
 */
export type Some<T> = Prettify<{
  readonly ok: true;
  readonly value: T;
  readonly [OPTION_SYMBOL]: true;
}>;

/**
 * Represents the absence of a value.
 *
 * When to use:
 * - When a value is absent, unavailable, or deferred.
 */
export type None = Prettify<{
  readonly ok: false;
  readonly value: undefined;
  readonly [OPTION_SYMBOL]: true;
}>;

/**
 * A discriminated union representing either a value ({@link Some})
 * or the absence of a value ({@link None}).
 *
 * When to use:
 * - For fields, returns, or parameters that may or may not contain a value.
 */
export type Option<T> = Some<T> | None;

// Optimization: Registry to track valid Option instances for secure runtime protocol verification.
const OPTION_REGISTRY = new WeakSet<object>();

// Logic: Registers an object in the Option registry and returns it.
const register = <T extends object>(opt: T): T => {
  OPTION_REGISTRY.add(opt);
  return opt;
};

/**
 * Checks if a value is a valid {@link Option} instance.
 *
 * When to use:
 * - To verify at runtime whether an unknown input conforms to the Option protocol.
 *
 * @param val - The value to check.
 * @returns True if the value is an Option, false otherwise.
 *
 * @example
 * const isOpt = isOption(Option.some(42)); // true
 */
export const isOption = (val: unknown): val is Option<unknown> =>
  !!val && typeof val === 'object' && OPTION_REGISTRY.has(val);

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
  some: <T>(value: T): Some<T> => register({ ok: true, value, [OPTION_SYMBOL]: true }),

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
  none: register(
    Object.freeze({
      ok: false,
      value: undefined,
      [OPTION_SYMBOL]: true,
    } as const) as Option<never>
  ),

  /**
   * Checks if an Option contains a value.
   *
   * When to use:
   * - As a type guard to narrow the type to Some.
   *
   * @param opt - The Option to check.
   * @returns True if the Option is Some.
   *
   * @example
   * if (Option.isSome(opt)) {
   *   console.log(opt.value);
   * }
   */
  isSome: <T>(opt: Option<T>): opt is Some<T> => opt.ok,

  /**
   * Checks if an Option is empty.
   *
   * When to use:
   * - As a type guard to narrow the type to None.
   *
   * @param opt - The Option to check.
   * @returns True if the Option is None.
   *
   * @example
   * if (Option.isNone(opt)) {
   *   console.log("Empty");
   * }
   */
  isNone: <T>(opt: Option<T>): opt is None => !opt.ok,

  /**
   * Returns the value of a Some, or throws a defined error if it is None.
   *
   * When to use:
   * - When a value must be present, raising an error otherwise.
   *
   * @param opt - The Option to extract the value from.
   * @param message - The error message to throw.
   * @returns The inner value of Some.
   * @throws {Error} If the Option is None.
   *
   * @example
   * const val = Option.expect(opt, "Value must be present");
   */
  expect: <T>(opt: Option<T>, message: string): T => {
    if (opt.ok) return opt.value;
    throw new Error(message);
  },

  /**
   * Extracts the inner value of a Some, or throws a default error if it is None.
   *
   * When to use:
   * - For assertion-style extraction when failure indicates a logic bug.
   *
   * @param opt - The Option to extract the value from.
   * @returns The inner value of Some.
   * @throws {Error} If the Option is None.
   *
   * @example
   * const val = Option.unwrap(opt);
   */
  unwrap: <T>(opt: Option<T>): T => Option.expect(opt, 'Option.unwrap() on None'),

  /**
   * Returns the inner value if present, otherwise returns a fallback value.
   *
   * When to use:
   * - To retrieve the value with a static fallback.
   *
   * @param opt - The Option to extract the value from.
   * @param fallback - The default value to use if None.
   * @returns The inner value of Some, or the fallback.
   *
   * @example
   * const val = Option.unwrapOr(opt, 0);
   */
  unwrapOr: <T, U>(opt: Option<T>, fallback: U): T | U => (opt.ok ? opt.value : fallback),

  /**
   * Returns the inner value if present, otherwise computes a fallback value.
   *
   * @remarks
   * The fallback function is evaluated lazily, running only when the Option is None.
   *
   * When to use:
   * - To retrieve the value with a lazily computed fallback.
   *
   * @param opt - The Option to extract the value from.
   * @param fn - A function that computes the fallback value.
   * @returns The inner value of Some, or the computed fallback.
   *
   * @example
   * const val = Option.unwrapOrElse(opt, () => computeDefault());
   */
  unwrapOrElse: <T, U>(opt: Option<T>, fn: () => U): T | U => (opt.ok ? opt.value : fn()),

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
   * @param opt - The Option to map.
   * @param fn - The function to apply to the inner value.
   * @returns A new Option containing the transformed value, or None.
   *
   * @example
   * const opt2 = Option.map(opt1, x => x * 2);
   */
  map: <T, U>(opt: Option<T>, fn: (val: T) => U): Option<U> => {
    if (!opt.ok) return opt;
    const next = fn(opt.value);
    // Optimization: Reuses the original Option instance if the value remains unchanged.
    return Object.is(next, opt.value) ? (opt as unknown as Option<U>) : Option.some(next);
  },

  /**
   * Chains a function that returns another Option.
   *
   * When to use:
   * - To compose multiple operations that may each return an Option.
   *
   * @param opt - The Option to chain.
   * @param fn - The function returning an Option.
   * @returns The resulting Option from the function, or None.
   *
   * @example
   * const opt2 = Option.andThen(opt1, x => findUser(x));
   */
  andThen: <T, U>(opt: Option<T>, fn: (val: T) => Option<U>): Option<U> =>
    opt.ok ? fn(opt.value) : opt,

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
    value == null || Object.is(value, NaN) ? Option.none : Option.some(value),

  /**
   * Executes a branch handler based on whether the Option contains a value.
   *
   * When to use:
   * - To perform conditional logic for both cases of an Option.
   *
   * @param opt - The Option to match.
   * @param branches - The handlers for Some and None.
   * @returns The value returned by the executed branch.
   *
   * @example
   * const res = Option.match(opt, {
   *   some: v => `User: ${v}`,
   *   none: () => 'Guest'
   * });
   */
  match: <T, R>(opt: Option<T>, branches: { some: (val: T) => R; none: () => R }): R =>
    opt.ok ? branches.some(opt.value) : branches.none(),

  /**
   * Returns None if the inner value does not satisfy the predicate.
   *
   * When to use:
   * - To filter a wrapped value based on a condition.
   *
   * @param opt - The Option to filter.
   * @param predicate - The condition to test the value against.
   * @returns The Option if the predicate is met, otherwise None.
   *
   * @example
   * const positiveOpt = Option.filter(opt, x => x > 0);
   */
  filter: <T>(opt: Option<T>, predicate: (val: T) => boolean): Option<T> =>
    opt.ok && predicate(opt.value) ? opt : Option.none,

  /**
   * Checks for structural and value equality between two Options.
   *
   * @remarks
   * Performs a strict equality check using `Object.is` for Some values. Returns false
   * if either input is not a valid Option instance.
   *
   * When to use:
   * - To compare two Option states for equivalence.
   *
   * @param a - The first Option to compare.
   * @param b - The second Option to compare.
   * @returns True if both Options represent the same state and value.
   *
   * @example
   * const equal = Option.equals(optA, optB);
   */
  equals: <T>(a: Option<T>, b: Option<T>): boolean => {
    // Logic: Fast-paths identical references before performing checks.
    if (!isOption(a) || !isOption(b)) return false;
    if (a === b) return true;
    // Logic: Narrows the types of both options to Some before accessing their values.
    return a.ok && b.ok ? Object.is(a.value, b.value) : a.ok === b.ok;
  },

  /**
   * Converts an Option to a nullable representation.
   *
   * When to use:
   * - When interacting with legacy APIs that expect null.
   *
   * @param opt - The Option to convert.
   * @returns The inner value of Some, or null.
   *
   * @example
   * const val = Option.toNullable(opt);
   */
  toNullable: <T>(opt: Option<T>): T | null => (opt.ok ? opt.value : null),

  /**
   * Converts an Option to an undefined representation.
   *
   * When to use:
   * - When interacting with legacy APIs that expect undefined.
   *
   * @param opt - The Option to convert.
   * @returns The inner value of Some, or undefined.
   *
   * @example
   * const val = Option.toUndefined(opt);
   */
  toUndefined: <T>(opt: Option<T>): T | undefined => (opt.ok ? opt.value : undefined),
};
