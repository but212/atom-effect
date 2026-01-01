import { AtomError } from '../errors/errors';
import { scheduler } from './scheduler';

/**
 * Executes multiple reactive updates in a single batch.
 *
 * Batching groups multiple state changes together, deferring notifications
 * until all updates are complete. This prevents intermediate states from
 * triggering unnecessary recomputations and improves performance.
 *
 * @template T - The return type of the callback function
 * @param callback - The function containing batched updates
 * @returns The result of the callback function
 * @throws {AtomError} If the callback is not a function
 * @throws {AtomError} If an error occurs during batch execution
 *
 * @example
 * ```typescript
 * const firstName = atom('John');
 * const lastName = atom('Doe');
 *
 * // Without batching: triggers 2 separate updates
 * firstName.value = 'Jane';
 * lastName.value = 'Smith';
 *
 * // With batching: triggers 1 combined update
 * batch(() => {
 *   firstName.value = 'Jane';
 *   lastName.value = 'Smith';
 * });
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
