import { AtomError } from '../errors/errors';
import { trackingContext } from './context';

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
