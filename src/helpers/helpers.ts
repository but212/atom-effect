/**
 * @fileoverview Utility helper functions for reactive state management
 * @description Provides batching, untracked execution, and type guards
 */

import { AtomError } from '../errors/errors';
import type { ComputedAtom, EffectObject, ReadonlyAtom } from '../types';
import { debug } from '../utils/debug';
import { scheduler } from '../utils/scheduler';
import { trackingContext } from '../utils/tracking';

/**
 * Batches multiple atom updates into a single notification cycle
 *
 * When multiple atoms are updated in sequence, each update normally triggers
 * immediate notifications. Batching defers all notifications until the callback
 * completes, resulting in a single update cycle.
 *
 * Benefits:
 * - Reduces redundant computations and effect executions
 * - Improves performance when updating multiple related atoms
 * - Ensures atomic state transitions (all-or-nothing)
 *
 * @template T - Return type of the callback
 * @param callback - Function containing atom updates to batch
 * @returns The return value of the callback
 * @throws {AtomError} If callback is not a function or throws an error
 *
 * @example
 * ```ts
 * const firstName = atom('John');
 * const lastName = atom('Doe');
 * const fullName = computed(() => `${firstName.value} ${lastName.value}`);
 *
 * effect(() => console.log(fullName.value));
 * // Without batch: logs twice
 * firstName.value = 'Jane';
 * lastName.value = 'Smith';
 *
 * // With batch: logs once
 * batch(() => {
 *   firstName.value = 'Jane';
 *   lastName.value = 'Smith';
 * }); // Logs: "Jane Smith" (only once)
 * ```
 */
export function batch<T>(callback: () => T): T {
  if (typeof callback !== 'function') {
    throw new AtomError('Batch callback must be a function');
  }

  scheduler.startBatch();

  try {
    return callback();
  } catch (error) {
    throw new AtomError('Error occurred during batch execution', error as Error);
  } finally {
    scheduler.endBatch();
  }
}

/**
 * Executes a function without tracking dependencies
 *
 * Useful when you need to read reactive values inside a computed or effect
 * without creating a dependency on them. The computation won't re-run when
 * untracked values change.
 *
 * @template T - Return type of the function
 * @param fn - Function to execute without dependency tracking
 * @returns The return value of the function
 * @throws {AtomError} If fn is not a function or throws an error
 *
 * @example
 * ```ts
 * const count = atom(0);
 * const debugMode = atom(false);
 *
 * // This computed only depends on count, not debugMode
 * const doubled = computed(() => {
 *   const result = count.value * 2;
 *
 *   // Read debugMode without creating dependency
 *   if (untracked(() => debugMode.value)) {
 *     console.log('Debug:', result);
 *   }
 *
 *   return result;
 * });
 *
 * debugMode.value = true; // Doesn't trigger recomputation
 * count.value = 5; // Triggers recomputation
 * ```
 */
export function untracked<T>(fn: () => T): T {
  if (typeof fn !== 'function') {
    throw new AtomError('Untracked callback must be a function');
  }

  const prev = trackingContext.current;
  trackingContext.current = null;

  try {
    return fn();
  } catch (error) {
    throw new AtomError('Error occurred during untracked execution', error as Error);
  } finally {
    trackingContext.current = prev;
  }
}

/**
 * Type guard to check if a value is an atom
 *
 * @param obj - Value to check
 * @returns True if the value is an atom (has value and subscribe)
 *
 * @example
 * ```ts
 * const count = atom(0);
 * const doubled = computed(() => count.value * 2);
 *
 * isAtom(count); // true
 * isAtom(doubled); // true (computed extends atom)
 * isAtom(42); // false
 * ```
 */
export function isAtom(obj: unknown): obj is ReadonlyAtom {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'value' in obj &&
    'subscribe' in obj &&
    typeof (obj as Record<string, unknown>).subscribe === 'function'
  );
}

/**
 * Type guard to check if a value is a computed atom
 *
 * @param obj - Value to check
 * @returns True if the value is a computed atom (has invalidate method)
 *
 * @example
 * ```ts
 * const count = atom(0);
 * const doubled = computed(() => count.value * 2);
 *
 * isComputed(count); // false
 * isComputed(doubled); // true
 * ```
 */
export function isComputed(obj: unknown): obj is ComputedAtom {
  if (debug.enabled) {
    const debugType = debug.getDebugType(obj);
    if (debugType) {
      return debugType === 'computed';
    }
  }
  return (
    isAtom(obj) &&
    'invalidate' in obj &&
    typeof (obj as Record<string, unknown>).invalidate === 'function'
  );
}

/**
 * Type guard to check if a value is an effect object
 *
 * @param obj - Value to check
 * @returns True if the value is an effect (has dispose and run methods)
 *
 * @example
 * ```ts
 * const count = atom(0);
 * const eff = effect(() => console.log(count.value));
 *
 * isEffect(count); // false
 * isEffect(eff); // true
 * ```
 */
export function isEffect(obj: unknown): obj is EffectObject {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'dispose' in obj &&
    'run' in obj &&
    typeof (obj as Record<string, unknown>).dispose === 'function' &&
    typeof (obj as Record<string, unknown>).run === 'function'
  );
}
