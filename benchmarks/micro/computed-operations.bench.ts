/**
 * @fileoverview Computed operations benchmark
 */

import { runBenchmark } from '../utils/benchmark-runner';
import { atom, computed } from '../utils/import-lib';
import { MemoryTracker } from '../utils/memory-tracker';

export async function runComputedOperationsBenchmark() {
  const tracker = new MemoryTracker();

  tracker.snapshot();

  const results = await runBenchmark(
    'Computed Operations',
    {
      'computed creation (sync)': () => {
        const a = atom(1);
        const c = computed(() => a.value * 2);
        c.dispose();
      },

      'computed creation (async)': () => {
        const a = atom(1);
        const c = computed(async () => a.value * 2);
        c.dispose();
      },

      'computed read (no recalc)': () => {
        const a = atom(1);
        const c = computed(() => a.value * 2);
        c.value;
        c.value; // read cached value
        c.dispose();
      },

      'computed recalc (single dependency)': () => {
        const a = atom(1);
        const c = computed(() => a.value * 2);
        c.value;
        a.value = 2;
        c.value; // recalculate
        c.dispose();
      },

      'computed recalc (5 dependencies)': () => {
        const atoms = Array.from({ length: 5 }, (_, i) => atom(i));
        const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
        c.value;
        atoms[0].value = 10;
        c.value;
        c.dispose();
      },

      'computed recalc (10 dependencies)': () => {
        const atoms = Array.from({ length: 10 }, (_, i) => atom(i));
        const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
        c.value;
        atoms[0].value = 10;
        c.value;
        c.dispose();
      },

      'computed recalc (50 dependencies)': () => {
        const atoms = Array.from({ length: 50 }, (_, i) => atom(i));
        const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
        c.value;
        atoms[0].value = 10;
        c.value;
        c.dispose();
      },

      'computed chain (depth 5)': () => {
        const a = atom(1);
        let c = computed(() => a.value);
        for (let i = 0; i < 4; i++) {
          const prev = c;
          c = computed(() => prev.value + 1);
        }
        c.value;
        c.dispose();
      },

      'computed chain (depth 10)': () => {
        const a = atom(1);
        let c = computed(() => a.value);
        for (let i = 0; i < 9; i++) {
          const prev = c;
          c = computed(() => prev.value + 1);
        }
        c.value;
        c.dispose();
      },

      'computed with complex calc': () => {
        const a = atom(10);
        const c = computed(() => {
          let result = 0;
          for (let i = 0; i < a.value; i++) {
            result += Math.sqrt(i);
          }
          return result;
        });
        c.value;
        c.dispose();
      },

      'computed async await': async () => {
        const a = atom(1);
        const c = computed(
          async () => {
            return a.value * 2;
          },
          { defaultValue: 0 }
        );

        // trigger initial calculation (returns defaultValue synchronously)
        const _initialValue = c.value;

        // update value
        a.value = 2;

        // wait for microtask to complete
        await Promise.resolve();

        // final value
        const _finalValue = c.value;

        c.dispose();
      },

      'computed with conditional': () => {
        const a = atom(5);
        const b = atom(10);
        const c = computed(() => {
          if (a.value > 5) {
            return b.value;
          }
          return a.value;
        });
        c.value;
        a.value = 6;
        c.value;
        c.dispose();
      },
    },
    { time: 20, iterations: 10, maxSamples: 2000 }
  );

  tracker.snapshot();
  const memoryDiff = tracker.lastDiff();
  if (memoryDiff) {
    tracker.printDiff(memoryDiff);
  }

  return { results, memory: memoryDiff || undefined };
}

// directly run benchmark
// if (import.meta.url === `file://${process.argv[1]}`) {
//   runComputedOperationsBenchmark().catch(console.error);
// }
