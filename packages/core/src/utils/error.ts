import { AtomError } from '@/errors/errors';

export function wrapError(
  error: unknown,
  ErrorClass: typeof AtomError,
  context: string
): AtomError {
  if (error instanceof AtomError) return error;

  const isError = error instanceof Error;
  const msg = isError ? error.message : String(error);
  const type =
    error instanceof TypeError
      ? 'Type error'
      : error instanceof ReferenceError
        ? 'Reference error'
        : 'Unexpected error';

  return new ErrorClass(`${type} (${context}): ${msg}`, isError ? error : null);
}
