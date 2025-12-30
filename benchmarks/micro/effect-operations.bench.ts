/**
 * @fileoverview Effect operations benchmark
 */

import { runBenchmark } from '../utils/benchmark-runner';
import { atom, effect } from '../utils/import-lib';
import { MemoryTracker } from '../utils/memory-tracker';

export async function runEffectOperationsBenchmark() {
  const tracker = new MemoryTracker();

  tracker.snapshot();

  const results = await runBenchmark(
    'Effect Operations',
    {
      'effect creation': () => {
        const a = atom(0);
        const e = effect(() => {
          a.value;
        });
        e.dispose();
      },

      'effect creation and run': () => {
        const a = atom(0);
        let _count = 0;
        const e = effect(() => {
          _count = a.value;
        });
        e.dispose();
      },

      'effect re-run': () => {
        const a = atom(0);
        const _count = 0;
        const e = effect(() => {});
        a.value = 1;
        a.value = 2;
        e.dispose();
      },

      'effect with cleanup': () => {
        const a = atom(0);
        const e = effect(() => {
          const _value = a.value;
          return () => {
            // cleanup logic
          };
        });
        a.value = 1;
        e.dispose();
      },

      'effect with multiple dependencies (5)': () => {
        const atoms = Array.from({ length: 5 }, (_, i) => atom(i));
        let _sum = 0;
        const e = effect(() => {
          _sum = atoms.reduce((acc, a) => acc + a.value, 0);
        });
        atoms[0].value = 10;
        e.dispose();
      },

      'effect dispose': () => {
        const a = atom(0);
        const effectObj = effect(() => {
          a.value;
        });
        effectObj.dispose();
      },

      'effect with nested effect': () => {
        const a = atom(0);
        const b = atom(0);
        const parent = effect(() => {
          a.value;
          const child = effect(() => {
            b.value;
          });
          child.dispose();
        });
        a.value = 1;
        parent.dispose();
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
//   runEffectOperationsBenchmark().catch(console.error);
// }
