import { ERROR_MESSAGES } from '@/errors/messages';
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
    throw new TypeError(ERROR_MESSAGES.BATCH_CALLBACK_MUST_BE_FUNCTION);
  }

  scheduler.startBatch();
  try {
    return fn();
  } finally {
    scheduler.endBatch();
  }
}
