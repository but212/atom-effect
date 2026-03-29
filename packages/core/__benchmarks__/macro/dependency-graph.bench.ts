/**
 * @fileoverview Dependency graph macro-benchmark
 * @description Large dependency graphs with various patterns
 */

import { bench, describe } from 'vitest';
import { atom, computed } from '@/index';
import { macroBenchOptions, microBenchOptions } from '../utils/setup.js';

const REPEATS = 1000;

describe('Dependency Chain Patterns', () => {
  const chainSource = atom(0);
  let chainSink = computed(() => chainSource.value);
  for (let i = 1; i < 100; i++) {
    const prev = chainSink;
    chainSink = computed(() => prev.value + 1);
  }

  const fanOutSource = atom(0);
  const fanOutSinks = Array.from({ length: 100 }, (_, i) =>
    computed(() => fanOutSource.value * (i + 1))
  );

  const diamondSource = atom(1);
  const diamondLevel1 = Array.from({ length: 10 }, (_, i) =>
    computed(() => diamondSource.value * (i + 1))
  );
  const diamondLevel2 = Array.from({ length: 10 }, (_, i) =>
    computed(() => diamondLevel1[i]!.value * 2)
  );
  const diamondSink = computed(() => diamondLevel2.reduce((sum, c) => sum + c.value, 0));

  const pyramidBase = Array.from({ length: 50 }, (_, i) => atom(i));

  // Build pyramid
  const buildPyramid = () => {
    let currentLevel = pyramidBase.map((a) => computed(() => a.value));

    for (let level = 1; level < 50; level++) {
      const nextLevel: ReturnType<typeof computed<number>>[] = [];
      for (let i = 0; i < currentLevel.length - 1; i++) {
        const left = currentLevel[i]!;
        const right = currentLevel[i + 1]!;
        nextLevel.push(computed(() => left.value + right.value));
      }
      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }
    return currentLevel[0];
  };

  const pyramidApex = buildPyramid();

  bench(
    'deep chain (100 levels)',
    () => {
      chainSource.value += 1;
      const _ = chainSink.value;
    },
    macroBenchOptions
  );

  bench(
    'wide fan-out (1 atom → 100 computeds)',
    () => {
      fanOutSource.value += 1;
      fanOutSinks.forEach((c) => {
        const _ = c.value;
      });
    },
    macroBenchOptions
  );

  bench(
    'diamond dependency pattern',
    () => {
      diamondSource.value += 1;
      const _ = diamondSink.value;
    },
    macroBenchOptions
  );

  bench(
    'pyramid dependency pattern (50 levels)',
    () => {
      pyramidBase[0]!.value += 1;
      const _ = pyramidApex!.value;
    },
    macroBenchOptions
  );
});

describe('Complex Graph Patterns', () => {
  const mixedAtoms = Array.from({ length: 100 }, (_, i) => atom(i));
  const mixedComputeds = Array.from({ length: 200 }, (_, i) => {
    const idx1 = i % mixedAtoms.length;
    const idx2 = (i + 1) % mixedAtoms.length;
    return computed(() => mixedAtoms[idx1]!.value + mixedAtoms[idx2]!.value);
  });

  const circA = atom(1);
  const circB = atom(2);
  const circC = atom(3);

  const circAb = computed(() => circA.value + circB.value);
  const circBc = computed(() => circB.value + circC.value);
  const circCa = computed(() => circC.value + circA.value);
  const circAll = computed(() => circAb.value + circBc.value + circCa.value);

  bench(
    'mixed dependencies (100 atoms, 200 computeds)',
    () => {
      // Update one atom, check all
      mixedAtoms[0]!.value += 1;
      mixedComputeds.forEach((c) => {
        const _ = c.value;
      });
    },
    macroBenchOptions
  );

  bench(
    'circular avoidance pattern',
    () => {
      circA.value += 1;
      const _ = circAll.value;
    },
    macroBenchOptions
  );
});

describe('Dynamic Dependency Patterns', () => {
  const condAtom = atom(true);
  const condA = atom(1);
  const condB = atom(2);
  const condResult = computed(() => (condAtom.value ? condA.value : condB.value));

  const idxAtom = atom(0);
  const arrValues = Array.from({ length: 10 }, (_, i) => atom(i));
  const arrSelected = computed(() => arrValues[idxAtom.value]!.value);

  bench(
    `conditional dependencies (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        // Toggle condition to switch dependency leg
        condAtom.value = !condAtom.value;
        const _ = condResult.value;

        // Update active branch
        if (condAtom.value) {
          condA.value++;
        } else {
          condB.value++;
        }
        const __ = condResult.value;
      }
    },
    microBenchOptions
  );

  bench(
    `array-based dynamic dependencies (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        // Change index
        idxAtom.value = (idxAtom.value + 1) % 10;
        const _ = arrSelected.value;

        // Update underlying value
        arrValues[idxAtom.value]!.value++;
        const __ = arrSelected.value;
      }
    },
    microBenchOptions
  );
});
