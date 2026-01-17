import { AtomError } from '@/errors/errors';

/**
 * Wraps an unknown error in the appropriate AtomError subclass
 *
 * Provides consistent error handling by:
 * - Preserving original error information in the cause field
 * - Adding contextual information about where the error occurred
 * - Returning existing AtomErrors unchanged
 * - Handling various error types (TypeError, ReferenceError, etc.)
 *
 * @param error - Unknown error to wrap
 * @param ErrorClass - AtomError subclass to use for wrapping
 * @param context - Context string describing where the error occurred
 * @returns Wrapped error with contextual information
 *
 * @example
 * ```ts
 * try {
 *   computeFn();
 * } catch (err) {
 *   throw wrapError(err, ComputedError, 'computation phase');
 * }
 * ```
 */
export function wrapError(
  error: unknown,
  ErrorClass: typeof AtomError,
  context: string
): AtomError {
  if (error instanceof TypeError) {
    return new ErrorClass(`Type error (${context}): ${error.message}`, error);
  }
  if (error instanceof ReferenceError) {
    return new ErrorClass(`Reference error (${context}): ${error.message}`, error);
  }
  if (error instanceof AtomError) {
    return error;
  }

  // Handle other error types
  const errorMessage = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : null;
  return new ErrorClass(`Unexpected error (${context}): ${errorMessage}`, cause);
}
