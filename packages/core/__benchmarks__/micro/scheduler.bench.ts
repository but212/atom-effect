/**
 * @fileoverview Micro-benchmarks for scheduler and context primitives
 * @description Measures aeNextTick scheduling cost, untracked context
 * switching overhead, and batch nesting cost. External API only.
 */

import { bench, describe } from 'vitest';
import { aeNextTick, atom, computed, untracked } from '../../dist';
import {
  asyncParallelBenchOptions,
  asyncSingleBenchOptions,
  keep,
  microBenchOptions,
  REPEATS,
} from '../utils/setup.js';

describe('Scheduler: aeNextTick', () => {
  bench(
    'baseline: schedule 1 native microtask',
    async () => {
      await Promise.resolve();
    },
    asyncSingleBenchOptions
  );

  bench(
    'schedule 1 microtask',
    async () => {
      await aeNextTick();
    },
    asyncSingleBenchOptions
  );

  const promises = new Array<Promise<void>>(REPEATS);

  const asyncParallelCases = [
    { name: `baseline: schedule ${REPEATS} native microtasks`, schedule: () => Promise.resolve() },
    { name: `schedule ${REPEATS} microtasks`, schedule: () => aeNextTick() },
  ];

  for (const { name, schedule } of asyncParallelCases) {
    bench(
      `${name} (parallel)`,
      async () => {
        for (let i = 0; i < REPEATS; i++) {
          promises[i] = schedule();
        }
        await Promise.all(promises);
      },
      asyncParallelBenchOptions
    );
  }
});

describe('Scheduler: untracked context', () => {
  const a = atom(0);
  // Pre-creating computed avoids creation/disposal overhead in the hot path
  const c = computed(() => {
    let sum = 0;
    for (let i = 0; i < REPEATS; i++) sum += a.value;
    return sum;
  });

  bench(
    `tracked read inside computed (x${REPEATS})`,
    () => {
      a.value++; // Force re-computation
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
