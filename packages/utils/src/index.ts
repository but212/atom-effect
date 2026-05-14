export * from '@/option';
export {
  type Err,
  type Ok,
  Result,
} from '@/result';
export { SlotBuffer } from '@/slot-buffer';
export * from '@/type-guard';
export * from '@/types';

/**
 * Performs a shallow equality comparison between two values.
 *
 * Logic: Strict Comparison
 * Uses `Object.is` for value comparisons to correctly handle `NaN` equality
 * and signed zero distinctions (`+0` vs `-0`).
 *
 * Optimization: Performance
 * Implements early exits for identity matches and key length mismatches
 * to minimize iteration overhead in hot paths like reactive diffing.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  const state =
    (a !== null && typeof a === 'object' ? 1 : 0) | (b !== null && typeof b === 'object' ? 2 : 0);

  if (state !== 3) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) {
    return false;
  }

  for (const key of keysA) {
    if (!Object.hasOwn(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }
  return true;
}
