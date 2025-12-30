/**
 * @fileoverview Atom operations benchmark
 */

import { runBenchmark } from '../utils/benchmark-runner';
import { atom } from '../utils/import-lib';
import { MemoryTracker } from '../utils/memory-tracker';

export async function runAtomOperationsBenchmark() {
  const tracker = new MemoryTracker();

  tracker.snapshot();

  // test variable
  let counter = 0;

  const results = await runBenchmark(
    'Atom Operations',
    {
      'atom creation': () => {
        atom(0);
      },

      'atom creation (1000 atoms)': () => {
        const atoms: ReturnType<typeof atom>[] = [];
        for (let i = 0; i < 1000; i++) {
          atoms.push(atom(i));
        }
      },

      'atom read': () => {
        const a = atom(counter++);
        a.value;
      },

      'atom read/write cycle': () => {
        const a = atom(0);
        a.value = a.value + 1;
      },

      'atom subscribe': () => {
        const a = atom(0);
        const _unsub = a.subscribe(() => {});
      },

      'atom subscribe/unsubscribe': () => {
        const a = atom(0);
        const unsubscribe = a.subscribe(() => {});
        unsubscribe();
      },

      'atom multiple subscribers (10)': () => {
        const a = atom(0);
        const unsubscribers: (() => void)[] = [];
        for (let i = 0; i < 10; i++) {
          unsubscribers.push(a.subscribe(() => {}));
        }
        a.value = 1;
        unsubscribers.forEach((unsub) => unsub());
      },

      'atom with string value': () => {
        const a = atom('hello');
        a.value = 'world';
      },
      'atom with object value': () => {
        const a = atom({ count: 0 });
        a.value = { count: 1 };
      },

      'atom with array value': () => {
        const a = atom([1, 2, 3]);
        a.value = [4, 5, 6];
      },
    },
    { time: 500, iterations: 10000 }
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
//   runAtomOperationsBenchmark().catch(console.error);
// }
