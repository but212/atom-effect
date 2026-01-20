/**
 * Test utility functions for async operations.
 */

/**
 * Pauses execution for a specified number of milliseconds.
 * @param ms - Number of milliseconds to wait
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for the next tick of the event loop.
 * Useful for waiting for async scheduler to process pending updates.
 */
export const tick = (): Promise<void> => sleep(0);

/**
 * Waits for async scheduler with a reasonable default timeout.
 */
export const waitForScheduler = (): Promise<void> => sleep(10);

/**
 * Configuration type for fuzz testing.
 */
export interface FuzzConfig {
  atomCount: number;
  computedCount: number;
  updateCount: number;
  maxDepsPerComputed: number;
  effectCount: number;
}

/**
 * Default fuzz testing configuration (Heavy mode).
 */
export const DEFAULT_FUZZ_CONFIG: FuzzConfig = {
  atomCount: 1000,
  computedCount: 500,
  updateCount: 10000,
  maxDepsPerComputed: 5,
  effectCount: 50,
};
