/**
 * @fileoverview Diamond dependency problem benchmark
 *
 * structure:
 *     A
 *    / \
 *   B   C
 *    \ /
 *     D
 *
 * A changes should update B and C,
 * D should be recalculated only once (prevent duplicate calculation)
 */

import { runBenchmark } from '../utils/benchmark-runner';
import { atom, computed } from '../utils/import-lib';
import { MemoryTracker } from '../utils/memory-tracker';

/**
 * create diamond structure
 */
function createDiamond() {
  const a = atom(1);
  const b = computed(() => a.value + 1);
  const c = computed(() => a.value + 2);
  const d = computed(() => b.value + c.value);
  return { a, b, c, d };
}

function disposeDiamond(diamond: ReturnType<typeof createDiamond>): void {
  diamond.d.dispose();
  diamond.c.dispose();
  diamond.b.dispose();
}

/**
 * create multiple diamonds
 */
function createMultipleDiamonds(count: number) {
  const diamonds: ReturnType<typeof createDiamond>[] = [];
  for (let i = 0; i < count; i++) {
    diamonds.push(createDiamond());
  }
  return diamonds;
}

/**
 * complex diamond structure
 *       A
 *     / | \
 *    B  C  D
 *    |\/|\/|
 *    E  F  G
 *     \ | /
 *       H
 */
function createComplexDiamond() {
  const a = atom(1);
  const b = computed(() => a.value + 1);
  const c = computed(() => a.value + 2);
  const d = computed(() => a.value + 3);
  const e = computed(() => b.value + c.value);
  const f = computed(() => c.value + d.value);
  const g = computed(() => b.value + d.value);
  const h = computed(() => e.value + f.value + g.value);
  return { a, b, c, d, e, f, g, h };
}

function disposeComplexDiamond(diamond: ReturnType<typeof createComplexDiamond>): void {
  diamond.h.dispose();
  diamond.g.dispose();
  diamond.f.dispose();
  diamond.e.dispose();
  diamond.d.dispose();
  diamond.c.dispose();
  diamond.b.dispose();
}

export async function runDiamondProblemBenchmark() {
  const tracker = new MemoryTracker();

  tracker.snapshot();

  const results = await runBenchmark(
    'Diamond Problem',
    {
      'simple diamond - single update': () => {
        const diamond = createDiamond();
        diamond.a.value = 2;
        diamond.d.value;
        disposeDiamond(diamond);
      },

      'simple diamond - multiple updates': () => {
        const diamond = createDiamond();
        for (let i = 0; i < 10; i++) {
          diamond.a.value = i;
          diamond.d.value;
        }
        disposeDiamond(diamond);
      },

      'simple diamond - 10 instances': () => {
        const diamonds = createMultipleDiamonds(10);
        for (const { a, d } of diamonds) {
          a.value = 5;
          d.value;
        }
        for (const diamond of diamonds) {
          disposeDiamond(diamond);
        }
      },

      'simple diamond - 100 instances': () => {
        const diamonds = createMultipleDiamonds(100);
        for (const { a, d } of diamonds) {
          a.value = 5;
          d.value;
        }
        for (const diamond of diamonds) {
          disposeDiamond(diamond);
        }
      },

      'complex diamond - single update': () => {
        const diamond = createComplexDiamond();
        diamond.a.value = 2;
        diamond.h.value;
        disposeComplexDiamond(diamond);
      },

      'complex diamond - multiple updates': () => {
        const diamond = createComplexDiamond();
        for (let i = 0; i < 10; i++) {
          diamond.a.value = i;
          diamond.h.value;
        }
        disposeComplexDiamond(diamond);
      },

      'deep diamond chain (depth 10)': () => {
        const a = atom(1);
        let left = computed(() => a.value);
        let right = computed(() => a.value);

        for (let i = 0; i < 9; i++) {
          const prevLeft = left;
          const prevRight = right;
          left = computed(() => prevLeft.value + 1);
          right = computed(() => prevRight.value + 1);
        }
        const result = computed(() => left.value + right.value);
        a.value = 2;
        result.value;

        result.dispose();
        left.dispose();
        right.dispose();
      },

      'wide diamond (10 branches)': () => {
        const a = atom(1);
        const branches: ReturnType<typeof computed>[] = Array.from({ length: 10 }, () =>
          computed(() => a.value + Math.random())
        );
        const result = computed(() => branches.reduce((sum, b) => sum + (b.value as number), 0));
        a.value = 2;
        result.value;

        result.dispose();
        for (const b of branches) {
          b.dispose();
        }
      },

      'diamond with async computed': async () => {
        const a = atom(1);
        const b = computed(
          () => {
            return a.value + 1;
          },
          { defaultValue: 0 }
        );
        const c = computed(
          () => {
            return a.value + 2;
          },
          { defaultValue: 0 }
        );
        const d = computed(
          () => {
            return b.value + c.value;
          },
          { defaultValue: 0 }
        );

        // trigger initial calculation (returns defaultValue synchronously)
        const _initial = d.value;

        // update value
        a.value = 2;

        // wait for microtask to complete
        await Promise.resolve();

        // final value
        const _finalValue = d.value;

        d.dispose();
        c.dispose();
        b.dispose();
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
//   runDiamondProblemBenchmark().catch(console.error);
// }
