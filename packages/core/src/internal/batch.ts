import { AtomError } from '@/errors/errors';
import { scheduler } from './scheduler';

/**
 * Groups multiple state updates into a single notification cycle.
 * This optimizes performance by deferring the execution of scheduled effects
 * until the provided callback finishes execution, preventing redundant computations.
 *
 * @param callback - The function containing state updates to be batched.
 * @returns The value returned by the callback.
 * @throws {AtomError} If the provided callback is not a function.
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
