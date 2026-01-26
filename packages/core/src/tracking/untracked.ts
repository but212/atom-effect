import { AtomError } from '@/errors/errors';
import { trackingContext } from './context';

/**
 * Executes a function without tracking any reactive dependencies accessed during its execution.
 * This prevents the calling context from subscribing to any atoms read within the callback.
 *
 * @param fn - The function to execute in an untracked context.
 * @returns The value returned by the provided function.
 * @throws {AtomError} If the provided argument is not a function.
 */
export function untracked<T>(fn: () => T): T {
  if (typeof fn !== 'function') {
    throw new AtomError('Untracked callback must be a function');
  }

  const prev = trackingContext.current;
  trackingContext.current = null;

  try {
    return fn();
  } finally {
    trackingContext.current = prev;
  }
}
