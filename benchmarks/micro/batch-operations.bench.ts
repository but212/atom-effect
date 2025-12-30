/**
 * @fileoverview Batch operations benchmark
 */

import { runBenchmark } from '../utils/benchmark-runner';
import { atom, batch, computed } from '../utils/import-lib';
import { MemoryTracker } from '../utils/memory-tracker';

export async function runBatchOperationsBenchmark() {
  const tracker = new MemoryTracker();

  tracker.snapshot();

  const results = await runBenchmark(
    'Batch Operations',
    {
      'batch with single update': () => {
        const a = atom(0);
        const c = computed(() => a.value * 2);
        batch(() => {
          a.value = 1;
        });
        c.value;
      },

      'batch with 10 updates': () => {
        const atoms = Array.from({ length: 10 }, () => atom(0));
        const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
        batch(() => {
          atoms.forEach((a, i) => {
            a.value = i + 1;
          });
        });
        c.value;
      },

      'batch with 100 updates': () => {
        const atoms = Array.from({ length: 100 }, () => atom(0));
        const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
        batch(() => {
          atoms.forEach((a, i) => {
            a.value = i + 1;
          });
        });
        c.value;
      },

      'batch vs non-batch (10 updates)': () => {
        const atoms = Array.from({ length: 10 }, () => atom(0));
        const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
        atoms.forEach((a, i) => {
          a.value = i + 1;
        });
        c.value;
      },

      'nested batch (depth 5)': () => {
        const a = atom(0);
        const c = computed(() => a.value * 2);
        batch(() => {
          batch(() => {
            batch(() => {
              batch(() => {
                batch(() => {
                  a.value = 1;
                });
              });
            });
          });
        });
        c.value;
      },

      'nested batch (depth 10)': () => {
        const a = atom(0);
        const c = computed(() => a.value * 2);
        let batchFn = () => {
          a.value = 1;
        };
        for (let i = 0; i < 10; i++) {
          const innerFn = batchFn;
          batchFn = () => batch(innerFn);
        }
        batchFn();
        c.value;
      },

      'batch with computed chain': () => {
        const a = atom(0);
        const c1 = computed(() => a.value + 1);
        const c2 = computed(() => c1.value + 1);
        const c3 = computed(() => c2.value + 1);
        batch(() => {
          a.value = 1;
          a.value = 2;
          a.value = 3;
        });
        c3.value;
      },

      'batch with multiple computed': () => {
        const a = atom(0);
        const b = atom(0);
        const c1 = computed(() => a.value + b.value);
        const c2 = computed(() => a.value * b.value);
        const c3 = computed(() => c1.value + c2.value);
        batch(() => {
          a.value = 5;
          b.value = 10;
        });
        c3.value;
      },

      'batch with async updates': async () => {
        const a = atom(0);
        const c = computed(() => a.value * 2);
        await batch(async () => {
          a.value = 1;
          await Promise.resolve();
          a.value = 2;
        });
        c.value;
      },

      'batch early exit': () => {
        const a = atom(0);
        const c = computed(() => a.value * 2);
        try {
          batch(() => {
            a.value = 1;
            throw new Error('early exit');
          });
        } catch (_e) {
          // handle error
        }
        c.value;
      },
    },
    { time: 500, iterations: 5000 }
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
//   runBatchOperationsBenchmark().catch(console.error);
// }
