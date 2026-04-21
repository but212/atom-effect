import { BRAND, BrandFlags } from '@/symbols';
import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/** @internal */
interface Branded {
  [BRAND]?: number;
}

/** @internal */
interface Thenable {
  then: unknown;
}

/**
 * Internal helper to check for a brand flag on objects or functions.
 *
 * Optimization: Uses bitwise identity check on a single consolidated BRAND symbol.
 * This is significantly faster than multiple property checks or `instanceof`
 * in high-frequency reactive loops.
 *
 * @internal
 */
function isBranded<T>(obj: unknown, flag: number): obj is T {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false;

  // Optimization: Bitwise AND check on the consolidated BRAND symbol
  return !!((obj as Branded)[BRAND]! & flag);
}

/**
 * Checks if a value is an atom (either Readonly or Writable).
 *
 * When to use:
 * - Validating user input in APIs that expect atoms.
 * - Discriminating between raw values and reactive containers.
 *
 * @param obj - The value to check.
 * @returns True if the value has the Atom brand flag.
 *
 * @example
 * ```typescript
 * if (isAtom(maybeAtom)) {
 *   console.log(maybeAtom.value);
 * }
 * ```
 *
 * @public
 */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return isBranded(obj, BrandFlags.Atom);
}

/**
 * Checks if a value is a Writable atom.
 *
 * When to use:
 * - Ensuring an atom can be modified before calling `.set()` or `.update()`.
 *
 * @param obj - The value to check.
 * @returns True if the value has the Writable brand flag.
 *
 * @example
 * ```typescript
 * if (isWritable(maybeAtom)) {
 *   maybeAtom.value = newValue;
 * }
 * ```
 *
 * @public
 */
export function isWritable(obj: unknown): obj is WritableAtom {
  return isBranded(obj, BrandFlags.Writable);
}

/**
 * Checks if a value is a Computed atom.
 *
 * When to use:
 * - Identifying derived state containers that may have dependencies.
 *
 * @param obj - The value to check.
 * @returns True if the value has the Computed brand flag.
 *
 * @example
 * ```typescript
 * if (isComputed(maybeAtom)) {
 *   console.log('This is a derived value');
 * }
 * ```
 *
 * @public
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  return isBranded(obj, BrandFlags.Computed);
}

/**
 * Checks if a value is an Effect object.
 *
 * When to use:
 * - Validating objects that manage side-effects.
 *
 * @param obj - The value to check.
 * @returns True if the value has the Effect brand flag.
 *
 * @example
 * ```typescript
 * if (isEffect(maybeEffect)) {
 *   maybeEffect.dispose();
 * }
 * ```
 *
 * @public
 */
export function isEffect(obj: unknown): obj is EffectObject {
  return isBranded(obj, BrandFlags.Effect);
}

/**
 * Validates if a value is a Promise or a Thenable.
 *
 * When to use:
 * - Normalizing potentially asynchronous results.
 * - Supporting third-party Promise libraries (Thenables).
 *
 * Logic:
 * 1. Checks for native `Promise` using `instanceof` (Fast path).
 * 2. Eagerly exits for primitives to avoid expensive property lookups.
 * 3. Falls back to duck-typing for cross-library compatibility.
 *
 * @param value - The value to examine.
 * @returns True if the value has a `.then()` method.
 *
 * @example
 * ```typescript
 * if (isPromise(result)) {
 *   result.then(handleSuccess);
 * }
 * ```
 *
 * @public
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  // Optimization: Fast-path for native promises
  if (value instanceof Promise) return true;

  // Optimization: Eager-exit for primitives and null to avoid property indexing
  if (value === null || typeof value !== 'object') return false;

  // Logic: Duck-typed thenable (supports 3rd party libs)
  return typeof (value as Thenable).then === 'function';
}
