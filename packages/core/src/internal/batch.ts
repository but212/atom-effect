import { scheduler } from './scheduler';

/**
 * Batches updates.
 *
 * @param fn - Batch function.
 * @returns - Result of `fn`.
 */
export function batch<T>(fn: () => T): T {
  // Validate callback
  if (typeof fn !== 'function') {
    throw new TypeError('Batch callback must be a function');
  }

  scheduler.startBatch();
  try {
    return fn();
  } finally {
    scheduler.endBatch();
  }
}
