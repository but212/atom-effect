import { scheduler } from './scheduler';

/**
 * Groups multiple state updates into a single re-render cycle.
 *
 * @param fn - The function to execute within the batch.
 * @returns The return value of `fn`.
 */
export function batch<T>(fn: () => T): T {
  // Safe-guard against non-function inputs in dev/runtime
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
