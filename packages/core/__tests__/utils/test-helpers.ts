export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const tick = (): Promise<void> => sleep(0);

// Use a reasonable default timeout for async scheduler
export const waitForScheduler = (): Promise<void> => sleep(10);

export interface FuzzConfig {
  atomCount: number;
  computedCount: number;
  updateCount: number;
  maxDepsPerComputed: number;
  effectCount: number;
}

export const DEFAULT_FUZZ_CONFIG: FuzzConfig = {
  atomCount: 1000,
  computedCount: 500,
  updateCount: 10000,
  maxDepsPerComputed: 5,
  effectCount: 50,
};
