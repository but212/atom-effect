import { trackingContext } from './context';

/**
 * Untracked execution.
 *
 * @param fn - Function to execute.
 * @returns Result of `fn`.
 */
export function untracked<T>(fn: () => T): T {
  const ctx = trackingContext;
  const prev = ctx.current;

  // Optimized: Fast-path when already untracked
  if (prev === null) {
    return fn();
  }

  ctx.current = null;
  try {
    return fn();
  } finally {
    ctx.current = prev;
  }
}
