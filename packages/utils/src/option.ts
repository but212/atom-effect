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
 * Creates a {@link Some} instance holding a non-nullable value.
 *
 * @param value - The value to wrap.
 * @returns A {@link Some} instance.
 *
 * @example
 * const opt = Some(42);
 */
export const Some = <T>(value: T): Some<T> => ({
  ok: true,
  value,
  [OPTION_SYMBOL]: true,
});

/**
 * A constant representing the absence of a value.
 * Recommended over creating new objects for performance and equality checks.
 */
export const None: None = {
  ok: false,
  [OPTION_SYMBOL]: true,
};

/**
 * Type guard to check if an {@link Option} contains a value.
 */
export const isSome = <T>(opt: Option<T>): opt is Some<T> => opt.ok;

/**
 * Type guard to check if an {@link Option} is empty.
 */
export const isNone = <T>(opt: Option<T>): opt is None => !opt.ok;

/**
 * Extracts the inner value if present.
 *
 * Caution: This will throw a runtime error if the option is {@link None}.
 * Use {@link isSome} to check or {@link unwrapOr} for a safer alternative.
 *
 * @param opt - The option to unwrap.
 * @returns The inner value.
 * @throws {Error} If the option is {@link None}.
 *
 * @example
 * const value = unwrap(Some(10)); // 10
 * unwrap(None); // Throws Error
 */
export const unwrap = <T>(opt: Option<T>): T => {
  if (!opt.ok) throw new Error('Option.unwrap() on None');
  return opt.value;
};

/**
 * Returns the inner value if present, otherwise returns a fallback value.
 *
 * @param opt - The option to inspect.
 * @param fallback - The value to return if the option is {@link None}.
 *
 * @example
 * const val = unwrapOr(Some(5), 0); // 5
 * const val2 = unwrapOr(None, 0);   // 0
 */
export const unwrapOr = <T, U>(opt: Option<T>, fallback: U): T | U =>
  opt.ok ? opt.value : fallback;

/**
 * Returns the inner value if present, otherwise computes a fallback value.
 *
 * Recommended for: Scenarios where the fallback value is expensive to compute.
 *
 * @param opt - The option to inspect.
 * @param fn - A function that produces a fallback value lazily.
 *
 * @example
 * const val = unwrapOrElse(None, () => performExpensiveCalculation());
 */
export const unwrapOrElse = <T, U>(opt: Option<T>, fn: () => U): T | U =>
  opt.ok ? opt.value : fn();

/**
 * Transforms the inner value using the provided function if present.
 *
 * @param opt - The option to map.
 * @param fn - The transformation function.
 * @returns A new {@link Option} containing the result of `fn`, or {@link None}.
 *
 * @example
 * const doubled = map(Some(2), x => x * 2); // Some(4)
 * const none = map(None, x => x * 2);      // None
 */
export const map = <T, U>(opt: Option<T>, fn: (val: T) => U): Option<U> =>
  opt.ok ? Some(fn(opt.value)) : (opt as unknown as Option<U>);

/**
 * Chains a function that returns another {@link Option}.
 * Frequently referred to as `flatMap` in other functional libraries.
 *
 * @param opt - The option to chain.
 * @param fn - A function that returns a new {@link Option}.
 *
 * @example
 * const getSafe = (n: number) => n > 0 ? Some(n) : None;
 * const result = andThen(Some(5), getSafe); // Some(5)
 */
export const andThen = <T, U>(opt: Option<T>, fn: (val: T) => Option<U>): Option<U> =>
  opt.ok ? fn(opt.value) : (opt as unknown as Option<U>);

/**
 * Creates an {@link Option} from a value that might be `null` or `undefined`.
 *
 * @param value - The nullable input.
 *
 * @example
 * const opt = fromNullable(document.getElementById('app'));
 */
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value == null ? None : Some(value);

/**
 * Executes a branch handler based on whether the option is {@link Some} or {@link None}.
 * Useful for exhaustive pattern matching.
 *
 * @param opt - The option to match.
 * @param branches - Object containing `some` and `none` handlers.
 *
 * @example
 * const msg = match(opt, {
 *   some: (v) => `Value: ${v}`,
 *   none: () => 'Empty'
 * });
 */
export const match = <T, R>(opt: Option<T>, branches: { some: (val: T) => R; none: () => R }): R =>
  opt.ok ? branches.some(opt.value) : branches.none();

/**
 * Returns {@link None} if the inner value does not satisfy the predicate.
 *
 * @param opt - The option to filter.
 * @param predicate - A function to test the inner value.
 */
export const filter: {
  <T, U extends T>(opt: Option<T>, predicate: (val: T) => val is U): Option<U>;
  <T>(opt: Option<T>, predicate: (val: T) => boolean): Option<T>;
} = <T>(opt: Option<T>, predicate: (val: T) => boolean): Option<T> =>
  opt.ok && predicate(opt.value) ? opt : None;

/**
 * Checks for deep equality between two options.
 *
 * Logic:
 * Performs a reference check first, then verifies the `ok` status and
 * finally compares the inner values if both are `Some`.
 *
 * @param a - First option.
 * @param b - Second option.
 */
export const equals = <T>(a: Option<T>, b: Option<T>): boolean => {
  if (a === b) return true;
  if (!isOption(a) || !isOption(b)) return false;
  if (a.ok !== b.ok) return false;
  return !a.ok || (a as Some<T>).value === (b as Some<T>).value;
};

/**
 * Converts an {@link Option} to a nullable type.
 *
 * @returns The inner value or `null`.
 */
export const toNullable = <T>(opt: Option<T>): T | null => (opt.ok ? opt.value : null);

/**
 * Converts an {@link Option} to an undefined type.
 *
 * @returns The inner value or `undefined`.
 */
export const toUndefined = <T>(opt: Option<T>): T | undefined => (opt.ok ? opt.value : undefined);
