import { AtomError } from '../errors/errors';
import { trackingContext } from './context';

/**
 * Executes a function without tracking any reactive dependencies.
 *
 * This utility allows reading atom values without establishing
 * a dependency relationship, useful for accessing values that
 * shouldn't trigger recomputation when they change.
 *
 * @template T - The return type of the function
 * @param fn - The function to execute without tracking
 * @returns The result of the executed function
 * @throws {AtomError} If the callback is not a function
 * @throws {AtomError} If an error occurs during execution
 *
 * @example
 * ```typescript
 * const count = atom(0);
 * const doubled = computed(() => {
 *   // This read will NOT be tracked as a dependency
 *   const untrackedValue = untracked(() => count.value);
 *   return untrackedValue * 2;
 * });
 * ```
 */
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
