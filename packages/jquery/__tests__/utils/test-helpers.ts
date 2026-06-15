/**
 * Safely wraps a Promise as a JQuery.jqXHR object for testing.
 * This encapsulates the JQuery.jqXHR type casting.
 *
 * @param promise The promise representing the asynchronous execution.
 * @param extraProps Optional properties (like `abort` functions or metadata) to assign to the object.
 */
export function createMockJqXHR<T>(
  promise: Promise<T>,
  extraProps?: Partial<JQuery.jqXHR>
): JQuery.jqXHR {
  return castTo<JQuery.jqXHR>(Object.assign(promise, extraProps));
}

/**
 * Casts a value to a target type to bypass typescript compiler checks in tests.
 * This avoids inline `as unknown as TargetType` patterns.
 *
 * @param value The value to cast.
 */
export function castTo<T>(value: unknown): T {
  return value as T;
}
