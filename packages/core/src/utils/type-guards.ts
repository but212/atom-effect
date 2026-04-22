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
 * Logic: Multi-tiered detection strategy that prioritizes native `Promise` performance
 * before falling back to duck-typed thenable identification for cross-library safety.
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
  if (value instanceof Promise) return true;

  if (value === null || typeof value !== 'object') return false;

  return typeof (value as Thenable).then === 'function';
}
