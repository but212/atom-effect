import { AtomError } from '@/errors/errors';

/**
 * Wraps error.
 *
 * @param error - Raw error.
 * @param ErrorClass - Error class.
 * @param context - Error context.
 */
export function wrapError(
  error: unknown,
  ErrorClass: typeof AtomError,
  context: string
): AtomError {
  // 1. Skip if already wrapped
  if (error instanceof AtomError) {
    return error;
  }

  // 2. Handle native Error instances
  if (error instanceof Error) {
    const type = error.name || error.constructor.name || 'Error';
    return new ErrorClass(`${type} (${context}): ${error.message}`, error);
  }

  // 3. Handle unexpected types (string, number, etc.)
  return new ErrorClass(`Unexpected error (${context}): ${String(error)}`);
}
