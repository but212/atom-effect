/**
 * @fileoverview Micro-benchmarks for scheduler and context primitives
 * @description Measures aeNextTick scheduling cost, untracked context
 * switching overhead, and batch nesting cost. External API only.
 */

import { describe, test } from 'vitest';
import { aeNextTick, atom, computed, untracked } from '../../dist';
import {
  asyncParallelBenchOptions,
  asyncSingleBenchOptions,
  keep,
  microBenchOptions,
  REPEATS,
} from '../utils/setup.js';

const repeats = REPEATS;
const _keep = keep;
const _aeNextTick = aeNextTick;
const _atom = atom;
const _computed = computed;
const _untracked = untracked;

describe('Scheduler: aeNextTick', () => {
  test('single microtask comparison', async ({ bench }) => {
    await bench.compare(
      bench('baseline: schedule 1 native microtask', async () => {
        await Promise.resolve();
      }),
      bench('schedule 1 microtask', async () => {
        await _aeNextTick();
      }),
      asyncSingleBenchOptions
    );
  });

  test('parallel microtask comparison', async ({ bench }) => {
    const promises = new Array<Promise<void>>(repeats);

    const asyncParallelCases = [
      {
        name: `baseline: schedule ${repeats} native microtasks`,
        schedule: () => Promise.resolve(),
      },
      { name: `schedule ${repeats} microtasks`, schedule: () => _aeNextTick() },
    ];

    await bench.compare(
      ...asyncParallelCases.map(({ name, schedule }) =>
        bench(`${name} (parallel)`, async () => {
          for (let i = 0; i < repeats; i++) {
            promises[i] = schedule();
          }
          await Promise.all(promises);
        })
      ),
      asyncParallelBenchOptions
    );
  });
});

describe('Scheduler: untracked context', () => {
  test('untracked context comparison', async ({ bench }) => {
    const someAtom = _atom(0);
    // Pre-creating computed avoids creation/disposal overhead in the hot path
    const computedInstance = _computed(() => {
      let sum = 0;
      for (let i = 0; i < repeats; i++) sum += someAtom.value;
      return sum;
    });

    await bench.compare(
      bench(`tracked read inside computed (x${repeats})`, () => {
        someAtom.value++; // Force re-computation
        _keep(computedInstance.value);
      }),
      bench(`untracked(() => read) (x${repeats})`, () => {
        let sum = 0;
        _untracked(() => {
          for (let i = 0; i < repeats; i++) sum += someAtom.value;
        });
        _keep(sum);
      }),
      bench(`peek() read — no context (x${repeats})`, () => {
        let sum = 0;
        for (let i = 0; i < repeats; i++) sum += someAtom.peek();
        _keep(sum);
      }),
      microBenchOptions
    );
  });
});
