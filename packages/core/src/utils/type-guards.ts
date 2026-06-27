/**
 * @module TypeGuards
 *
 * Responsibility:
 * Provides runtime type-narrowing utilities for the reactive system.
 *
 * Design Intent:
 * Uses bitwise brand checks for high-performance identification of reactive
 * nodes, avoiding the overhead of `instanceof` or complex property lookups.
 */

import { isPromise } from '@but212/atom-effect-utils';
import { BRAND, BrandFlags } from '@/constants';
import type { ComputedAtom, EffectObject, ReadonlyAtom, WritableAtom } from '@/types';

/**
 * Logic: Bitwise Branding
 * Validates whether an object or function possesses a specific reactive flag.
 *
 * Optimization:
 * Bitwise checks on a consolidated symbol are significantly faster than
 * multiple property lookups, making them ideal for high-frequency execution loops.
 *
 * @internal
 */
function isBranded<T>(targetValue: unknown, flag: number): targetValue is T {
  if (targetValue && (typeof targetValue === 'object' || typeof targetValue === 'function')) {
    const brand = BRAND in targetValue ? Reflect.get(targetValue, BRAND) : undefined;
    return typeof brand === 'number' && (brand & flag) !== 0;
  }
  return false;
}

/**
 * Determines whether a value is a ReadonlyAtom.
 *
 * When to use:
 * - To validate user input in APIs that expect reactive atoms.
 * - To differentiate between raw values and reactive containers.
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
export function isAtom(targetValue: unknown): targetValue is ReadonlyAtom {
  return isBranded(targetValue, BrandFlags.Atom);
}

/**
 * Determines whether a value is a WritableAtom.
 *
 * When to use:
 * - To verify if an atom can be modified before attempting a write operation.
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
export function isWritable(targetValue: unknown): targetValue is WritableAtom {
  return isBranded(targetValue, BrandFlags.Writable);
}

/**
 * Determines whether a value is a ComputedAtom.
 *
 * When to use:
 * - To identify derived state containers in debug or optimization logic.
 *
 * @example
 * ```typescript
 * import { isComputed } from '@but212/atom-effect';
 *
 * if (isComputed(maybeAtom)) {
 *   console.log('This node is a derived computation.');
 * }
 * ```
 */
export function isComputed(targetValue: unknown): targetValue is ComputedAtom {
  return isBranded(targetValue, BrandFlags.Computed);
}

/**
 * Determines whether a value is an EffectObject.
 *
 * When to use:
 * - To validate handles that manage reactive side-effects.
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
export function isEffect(targetValue: unknown): targetValue is EffectObject {
  return isBranded(targetValue, BrandFlags.Effect);
}

/**
 * Determines whether a value is a standard Error object, including cross-realm instances.
 */
export function isError(error: unknown): error is Error {
  return (
    error instanceof Error ||
    (typeof error === 'object' &&
      error !== null &&
      Object.prototype.toString.call(error) === '[object Error]')
  );
}

export { isPromise };
