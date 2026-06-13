/**
 * Number of times to repeat the operation within a single benchmark iteration.
 */
export const REPEATS = 10;

export let _sink: unknown;

/**
 * Prevents Dead Code Elimination (DCE) by assigning the value to a sink.
 */
export function keep(value: unknown): void {
  _sink = value;
  if (_sink !== undefined && (globalThis as { __dce_guard__: unknown }).__dce_guard__ === _sink) {
    console.log(_sink);
  }
}
