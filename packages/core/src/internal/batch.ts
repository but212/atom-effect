import { AtomError } from '@/errors/errors';
import { scheduler } from './scheduler';

/**
 * Executes multiple reactive updates in a single batch and flushes them synchronously.
 *
 * While the engine automatically batches updates using microtasks, `batch()`
 * provides a way to group multiple changes and guarantee their immediate
 * reflection (synchronous flush) once the callback completes.
 *
 * @template T - The return type of the callback function
 * @param callback - The function containing batched updates
 * @returns The result of the callback function
 * @throws {AtomError} If the callback is not a function
 * @throws Propagates any error thrown by the callback function
 *
 * @example
 * ```typescript
 * const firstName = atom('John');
 * const lastName = atom('Doe');
 *
 * // With batching: triggers 1 combined synchronous update at the end
 * batch(() => {
 *   firstName.value = 'Jane';
 *   lastName.value = 'Smith';
 * });
 * // Changes are guaranteed to be applied here
 * ```
 */
export function batch<T>(callback: () => T): T {
  if (typeof callback !== 'function') {
    throw new AtomError('Batch callback must be a function');
  }

  scheduler.startBatch();

  try {
    return callback();
  } finally {
    scheduler.endBatch();
  }
}
