import { AtomError } from '@/errors/errors';

/**
 * Wraps an unknown error into a specific AtomError class with additional context.
 * If the error is already an instance of AtomError, it is returned as-is to preserve its original type and state.
 *
 * @param error - The error to wrap.
 * @param ErrorClass - The AtomError constructor to instantiate if wrapping is required.
 * @param context - A description of the context or operation where the error occurred.
 * @returns An AtomError instance.
 */
export function wrapError(
  error: unknown,
  ErrorClass: typeof AtomError,
  context: string
): AtomError {
  if (error instanceof AtomError) {
    return error;
  }

  const cause = error instanceof Error ? error : null;
  const msg = error instanceof Error ? error.message : String(error);

  const type =
    error instanceof TypeError
      ? 'Type error'
      : error instanceof ReferenceError
        ? 'Reference error'
        : 'Unexpected error';

  return new ErrorClass(`${type} (${context}): ${msg}`, cause);
}
