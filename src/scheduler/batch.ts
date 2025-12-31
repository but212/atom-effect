import { AtomError } from '../errors/errors';
import { scheduler } from './scheduler';

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
