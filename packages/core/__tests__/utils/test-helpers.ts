/**
 * Test utility functions for async operations.
 */

/**
 * Pauses execution for a specified number of milliseconds.
 * @param ms - Number of milliseconds to wait
 * @returns A promise that resolves after the specified delay
 *
 * @example
 * await sleep(100); // Wait 100ms
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for the next tick of the event loop.
 * Useful for waiting for async scheduler to process pending updates.
 *
 * @example
 * atom.value = 1;
 * await tick(); // Wait for scheduler to process
 */
export const tick = (): Promise<void> => sleep(0);
