/**
 * Number of times to repeat the operation within a single benchmark iteration.
 */
export const REPEATS = 100;

/**
 * Pre-generated random values to avoid Math.random() overhead during benchmarks.
 */
const RANDOM_POOL_SIZE = 1024;
const _randomPool = Array.from({ length: RANDOM_POOL_SIZE }, () => Math.random());
let _poolIdx = 0;

/**
 * Returns a pre-generated random number (0 to 1).
 */
export function nextRandom(): number {
  return _randomPool[_poolIdx++ % RANDOM_POOL_SIZE];
}

/**
 * Returns a random integer between 0 and max (exclusive).
 */
export function nextRandomInt(max: number): number {
  return Math.floor(nextRandom() * max);
}

/**
 * Side-effect sink to prevent DCE.
 */
let _sink: unknown;

/**
 * Prevents Dead Code Elimination by assigning to a module-level variable.
 */
export function keep(val: unknown): void {
  // Use a condition that is always true but hard for the compiler to prove at compile time
  if (_poolIdx > -1) {
    _sink = val;
  }
}

export function getSink(): unknown {
  return _sink;
}
