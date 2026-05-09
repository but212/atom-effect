import { isPromise } from '@but212/atom-effect-utils';
import { BRAND, BrandFlags } from '@/symbols';
import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/** @internal */
interface Branded {
  [BRAND]?: number;
}

/**
 * Validates whether an object or function possesses a specific reactive brand flag.
 *
 * Logic: This helper utilizes a bitwise identity check on a single consolidated
 * `BRAND` symbol.
 *
 * Optimization: Bitwise checks are significantly faster than multiple property
 * lookups or `instanceof` checks, making this suitable for high-frequency use
 * within reactive execution loops.
 *
 * @param obj - The value to examine.
 * @param flag - The bitwise flag to check for.
 * @returns True if the value contains the specified flag.
 * @internal
 */
function isBranded<T>(obj: unknown, flag: number): obj is T {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false;

  return !!((obj as Branded)[BRAND]! & flag);
}

/**
 * Determines whether a value is a ReadonlyAtom.
 *
 * When to use:
 * - To validate user input in APIs that expect reactive atoms.
 * - To differentiate between raw values and reactive containers.
 *
 * @param obj - The value to check.
 * @returns True if the value is an atom.
 *
 * @example
 * ```typescript
 * import { isAtom } from '@but212/atom-effect';
 *
 * if (isAtom(maybeAtom)) {
 *   console.log(maybeAtom.value);
 * }
 * ```
 */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return isBranded(obj, BrandFlags.Atom);
}

/**
 * Determines whether a value is a WritableAtom.
 *
 * When to use:
 * - To verify if an atom can be modified via `.set()` or `.update()` before attempting the operation.
 *
 * @param obj - The value to check.
 * @returns True if the value is a writable atom.
 *
 * @example
 * ```typescript
 * import { isWritable } from '@but212/atom-effect';
 *
 * if (isWritable(maybeAtom)) {
 *   maybeAtom.value = 123;
 * }
 * ```
 */
export function isWritable(obj: unknown): obj is WritableAtom {
  return isBranded(obj, BrandFlags.Writable);
}

/**
 * Determines whether a value is a ComputedAtom.
 *
 * When to use:
 * - To identify derived state containers that may have underlying dependencies.
 *
 * @param obj - The value to check.
 * @returns True if the value is a computed atom.
 *
 * @example
 * ```typescript
 * import { isComputed } from '@but212/atom-effect';
 *
 * if (isComputed(maybeAtom)) {
 *   console.log('This atom is a derived value.');
 * }
 * ```
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  return isBranded(obj, BrandFlags.Computed);
}

/**
 * Determines whether a value is an EffectObject.
 *
 * When to use:
 * - To validate objects that manage reactive side-effects.
 *
 * @param obj - The value to check.
 * @returns True if the value is an effect handle.
 *
 * @example
 * ```typescript
 * import { isEffect } from '@but212/atom-effect';
 *
 * if (isEffect(maybeEffect)) {
 *   maybeEffect.dispose();
 * }
 * ```
 */
export function isEffect(obj: unknown): obj is EffectObject {
  return isBranded(obj, BrandFlags.Effect);
}

export { isPromise };
