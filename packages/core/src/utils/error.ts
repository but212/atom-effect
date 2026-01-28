import { AtomError } from '@/errors/errors';

/**
 * Standardizes unknown thrown values into an `AtomError`.
 *
 * @param error - The raw error (unknown) caught in a try/catch.
 * @param ErrorClass - The specific AtomError subclass to instantiate.
 * @param context - Human-readable context for where the error was caught.
 */
export function wrapError(
  error: unknown,
  ErrorClass: typeof AtomError,
  context: string
): AtomError {
  // Pass-through if already wrapped to prevent double-wrapping
  if (error instanceof AtomError) {
    return error;
  }

  const isNativeError = error instanceof Error;
  const originalMessage = isNativeError ? error.message : String(error);
  const cause = isNativeError ? error : undefined;

  // Determine error category for clearer logging
  let type = 'Unexpected error';
  if (error instanceof TypeError) type = 'Type error';
  else if (error instanceof ReferenceError) type = 'Reference error';

  const finalMessage = `${type} (${context}): ${originalMessage}`;

  return new ErrorClass(finalMessage, cause);
}
