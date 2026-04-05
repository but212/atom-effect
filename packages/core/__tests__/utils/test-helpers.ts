export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const flush = (): Promise<void> => sleep(0);

export const nextTick = (): Promise<void> => Promise.resolve();

// Use a reasonable default timeout for async scheduler
export const waitForScheduler = (): Promise<void> => sleep(10);

// Simple seeded PRNG (sfc32) for reproducible fuzz tests
export function seededRandom(seed: number): () => number {
  let a = 13971 ^ seed;
  let b = 9461;
  let c = 40503;
  let d = 2654435769;

  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

// Internal structure test helpers
// biome-ignore lint/suspicious/noExplicitAny: Internal tests need access to private properties
export const getNodeVersion = (node: any): number => node.version;

// biome-ignore lint/suspicious/noExplicitAny: Internal tests need access to private properties
export const getSubscriberCount = (node: any): number => {
  return node._slots?.size ?? 0;
};
