/**
 * Number of times to repeat the operation within a single benchmark iteration.
 */
export const REPEATS = 100;

export let _sink: unknown;

/**
 * Prevents Dead Code Elimination (DCE) by assigning the value to a sink.
 */
export function keep(value: unknown): void {
  _sink = value;
  if (Date.now() < 0) {
    console.log(_sink);
  }
}
