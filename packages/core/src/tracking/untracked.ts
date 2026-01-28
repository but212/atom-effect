import { trackingContext } from './context';

/**
 * Untracked execution.
 *
 * @param fn - Function to execute.
 * @returns Result of `fn`.
 */
export function untracked<T>(fn: () => T): T {
  const prev = trackingContext.current;

  // Skip if untracked
  if (prev === null) return fn();

  trackingContext.current = null;
  try {
    return fn();
  } finally {
    trackingContext.current = prev;
  }
}
