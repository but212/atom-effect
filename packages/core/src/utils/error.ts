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

  let msg: string;
  let cause: Error | null = null;

  if (error instanceof Error) {
    msg = error.message;
    cause = error;
  } else {
    msg = String(error);
  }

  let type = 'Unexpected error';
  if (error instanceof TypeError) {
    type = 'Type error';
  } else if (error instanceof ReferenceError) {
    type = 'Reference error';
  }

  return new ErrorClass(`${type} (${context}): ${msg}`, cause);
}
