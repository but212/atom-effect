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
 * Transparent discriminated union for optional values.
 */
export type Option<T> = Some<T> | None;

/**
 * Creates a {@link Some} holding a value.
 *
 * @param value - The value to wrap.
 * @returns A {@link Some} instance.
 */
export const Some = <T>(value: T): Some<T> => ({
  ok: true,
  value,
  [OPTION_SYMBOL]: true,
});

/**
 * Represents the absence of a value.
 */
export const None: None = {
  ok: false,
  [OPTION_SYMBOL]: true,
};

/**
 * Checks whether the option is a {@link Some}.
 */
export const isSome = <T>(opt: Option<T>): opt is Some<T> => opt.ok;

/**
 * Checks whether the option is a {@link None}.
 */
export const isNone = <T>(opt: Option<T>): opt is None => !opt.ok;

/**
 * Extracts the inner value, throwing if the option is {@link None}.
 *
 * @param opt - The option to unwrap.
 * @throws Error when `opt` is {@link None}.
 */
export const unwrap = <T>(opt: Option<T>): T => {
  if (!opt.ok) throw new Error('Option.unwrap() on None');
  return opt.value;
};

/**
 * Returns the inner value if present, otherwise returns the provided fallback.
 *
 * @param opt - The option to inspect.
 * @param fallback - The value to return when `opt` is {@link None}.
 */
export const unwrapOr = <T, U>(opt: Option<T>, fallback: U): T | U =>
  opt.ok ? opt.value : fallback;

/**
 * Returns the inner value if present, otherwise evaluates `fn` and returns its result.
 *
 * @param opt - The option to inspect.
 * @param fn - A function producing a fallback value.
 */
export const unwrapOrElse = <T, U>(opt: Option<T>, fn: () => U): T | U =>
  opt.ok ? opt.value : fn();

/**
 * Applies `fn` to the inner value if present, otherwise propagates {@link None}.
 *
 * @param opt - The option to map.
 * @param fn - Mapping function.
 */
export const map = <T, U>(opt: Option<T>, fn: (val: T) => U): Option<U> =>
  opt.ok ? Some(fn(opt.value)) : (opt as unknown as Option<U>);

/**
 * Chains a function that returns an {@link Option}.
 *
 * @param opt - The option to chain.
 * @param fn - Function returning another option.
 */
export const andThen = <T, U>(opt: Option<T>, fn: (val: T) => Option<U>): Option<U> =>
  opt.ok ? fn(opt.value) : (opt as unknown as Option<U>);

/**
 * Creates an {@link Option} from a nullable value.
 *
 * @param value - The value that may be `null` or `undefined`.
 */
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value == null ? None : Some(value);

/**
 * Pattern‑matches an option.
 *
 * @param opt - The option to match.
 * @param branches - Handlers for the `some` and `none` cases.
 */
export const match = <T, R>(opt: Option<T>, branches: { some: (val: T) => R; none: () => R }): R =>
  opt.ok ? branches.some(opt.value) : branches.none();

/**
 * Filters the inner value with a predicate.
 *
 * @param opt - The option to filter.
 * @param predicate - Predicate that determines whether the value should be kept.
 */
export const filter: {
  <T, U extends T>(opt: Option<T>, predicate: (val: T) => val is U): Option<U>;
  <T>(opt: Option<T>, predicate: (val: T) => boolean): Option<T>;
} = <T>(opt: Option<T>, predicate: (val: T) => boolean): Option<T> =>
  opt.ok && predicate(opt.value) ? opt : None;

/**
 * Deep equality check for two options.
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
 * Converts an option to a nullable value.
 *
 * @param opt - The option to convert.
 */
export const toNullable = <T>(opt: Option<T>): T | null => (opt.ok ? opt.value : null);

/**
 * Converts an option to an undefined value.
 *
 * @param opt - The option to convert.
 */
export const toUndefined = <T>(opt: Option<T>): T | undefined => (opt.ok ? opt.value : undefined);
