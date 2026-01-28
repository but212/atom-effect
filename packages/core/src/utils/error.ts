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
  // Return if wrapped
  if (error instanceof AtomError) {
    return error;
  }

  const isNativeError = error instanceof Error;
  const originalMessage = isNativeError ? error.message : String(error);
  const cause = isNativeError ? error : undefined;

  // Error category
  let type = 'Unexpected error';
  if (error instanceof TypeError) type = 'Type error';
  else if (error instanceof ReferenceError) type = 'Reference error';

  const finalMessage = `${type} (${context}): ${originalMessage}`;

  return new ErrorClass(finalMessage, cause);
}
