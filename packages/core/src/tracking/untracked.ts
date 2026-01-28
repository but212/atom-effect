import { trackingContext } from './context';

/**
 * Executes a function exactly as is, but without tracking any reactive dependencies.
 *
 * @param fn - The function to execute.
 * @returns The result of function `fn`.
 */
export function untracked<T>(fn: () => T): T {
  const prev = trackingContext.current;

  // Fast path: if already null, just run.
  if (prev === null) return fn();

  trackingContext.current = null;
  try {
    return fn();
  } finally {
    trackingContext.current = prev;
  }
}
