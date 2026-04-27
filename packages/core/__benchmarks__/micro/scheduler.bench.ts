/**
 * @fileoverview Micro-benchmarks for scheduler and context primitives
 * @description Measures aeNextTick scheduling cost, untracked context
 * switching overhead, and batch nesting cost. External API only.
 */

import { bench, describe } from 'vitest';
import { aeNextTick, atom, batch, computed, effect, untracked } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

// ---------------------------------------------------------------------------
// aeNextTick: microtask scheduling latency
// ---------------------------------------------------------------------------

describe('Scheduler: aeNextTick', () => {
  bench(
    'schedule 1 microtask',
    async () => {
      await aeNextTick();
    },
    { time: 1000, iterations: 500, warmupTime: 100, warmupIterations: 10, throws: true }
  );

  bench(
    `schedule ${REPEATS} microtasks (parallel)`,
    async () => {
      await Promise.all(Array.from({ length: REPEATS }, () => aeNextTick()));
    },
    { time: 1500, iterations: 100, warmupTime: 200, warmupIterations: 5, throws: true }
  );
});

// ---------------------------------------------------------------------------
// untracked: tracking context switch overhead
// ---------------------------------------------------------------------------

describe('Scheduler: untracked context', () => {
  const a = atom(0);

  bench(
    `tracked read inside computed (x${REPEATS})`,
    () => {
      // Creating a fresh computed each time forces dependency tracking
      const c = computed(() => {
        let sum = 0;
        for (let i = 0; i < REPEATS; i++) sum += a.value;
        return sum;
      });
      keep(c.value);
    },
    microBenchOptions
  );

  bench(
    `untracked(() => read) (x${REPEATS})`,
    () => {
      let sum = 0;
      untracked(() => {
        for (let i = 0; i < REPEATS; i++) sum += a.value;
      });
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `peek() read — no context (x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) sum += a.peek();
      keep(sum);
    },
    microBenchOptions
  );
});

// ---------------------------------------------------------------------------
// batch: nesting and write coalescing
// ---------------------------------------------------------------------------

describe('Scheduler: batch nesting', () => {
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
  atoms.forEach((a) => effect(() => keep(a.value), benchEffectOptions));

  bench(
    `unbatched ${REPEATS} writes`,
    () => {
      for (let i = 0; i < REPEATS; i++) atoms[i]!.value++;
    },
    microBenchOptions
  );

  bench(
    `flat batch (${REPEATS} writes)`,
    () => {
      batch(() => {
        for (let i = 0; i < REPEATS; i++) atoms[i]!.value++;
      });
    },
    microBenchOptions
  );

  bench(
    `nested batch 3 levels (${REPEATS} writes)`,
    () => {
      batch(() =>
        batch(() =>
          batch(() => {
            for (let i = 0; i < REPEATS; i++) atoms[i]!.value++;
          })
        )
      );
    },
    microBenchOptions
  );
});
