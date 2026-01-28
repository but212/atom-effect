import { AtomError } from '@/errors/errors';
import { scheduler } from './scheduler';

/** Groups state updates into a single cycle. */
export function batch<T>(fn: () => T): T {
  if (typeof fn !== 'function') throw new AtomError('Batch callback must be a function');
  scheduler.startBatch();
  try {
    return fn();
  } finally {
    scheduler.endBatch();
  }
}
