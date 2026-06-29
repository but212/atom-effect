/**
 * @fileoverview Deterministic Fuzz Testing
 * @description Generates random dependency graphs and mutations to find edge cases.
 * deterministically seeded for reproducibility.
 */

import { seededRandom } from '@tests/utils/test-helpers';
import { describe, expect, it } from 'vitest';
import { atom, batch, type ComputedAtom, computed, type WritableAtom } from '@/index';

function buildGraph(randomGenerator: () => number, atomCount = 5, computedCount = 20) {
  const atoms: WritableAtom<number>[] = [];
  const computeds: ComputedAtom<number>[] = [];
  const allNodes: (WritableAtom<number> | ComputedAtom<number>)[] = [];
  const depMap: (WritableAtom<number> | ComputedAtom<number>)[][] = [];

  for (let i = 0; i < atomCount; i++) {
    const someAtom = atom(i);
    atoms.push(someAtom);
    allNodes.push(someAtom);
  }

  for (let i = 0; i < computedCount; i++) {
    const numDeps = Math.floor(randomGenerator() * 3) + 1;
    const deps: (WritableAtom<number> | ComputedAtom<number>)[] = [];
    for (let j = 0; j < numDeps; j++) {
      const dependency = allNodes[Math.floor(randomGenerator() * allNodes.length)];
      if (dependency) deps.push(dependency);
    }
    depMap.push(deps);
    const computedInstance = computed(() =>
      deps.reduce((sum, dependency) => sum + dependency.value, 0)
    );
    computeds.push(computedInstance);
    allNodes.push(computedInstance);
  }

  return { atoms, computeds, depMap };
}

describe('Fuzz Testing (Deterministic)', () => {
  it('computed values stay finite after random mutations', () => {
    const randomGenerator = seededRandom(12345);
    const { atoms, computeds } = buildGraph(randomGenerator);

    for (let i = 0; i < 100; i++) {
      const targetAtom = atoms[Math.floor(randomGenerator() * atoms.length)];
      if (targetAtom) targetAtom.value = Math.floor(randomGenerator() * 100);

      const targetComputed = computeds[Math.floor(randomGenerator() * computeds.length)];
      if (targetComputed) expect(Number.isFinite(targetComputed.value)).toBe(true);
    }
  });

  it('batch mutations produce glitch-free final state across the graph', () => {
    const randomGenerator = seededRandom(77777);
    const { atoms, computeds, depMap } = buildGraph(randomGenerator, 5, 10);

    for (let i = 0; i < 30; i++) {
      batch(() => {
        for (const someAtom of atoms) {
          someAtom.value = Math.floor(randomGenerator() * 100);
        }
      });

      for (let idx = 0; idx < computeds.length; idx++) {
        const computedInstance = computeds[idx];
        if (computedInstance) {
          const expected = depMap[idx]?.reduce((sum, dependency) => sum + dependency.value, 0);
          expect(computedInstance.value).toBe(expected);
        }
      }
    }
  });

  it('invalidate forces recomputation to a consistent value', () => {
    const randomGenerator = seededRandom(54321);
    const { atoms, computeds, depMap } = buildGraph(randomGenerator, 5, 10);

    for (let i = 0; i < 30; i++) {
      const targetAtom = atoms[Math.floor(randomGenerator() * atoms.length)];
      if (targetAtom) targetAtom.value = Math.floor(randomGenerator() * 100);

      const computedInstance = computeds[Math.floor(randomGenerator() * computeds.length)];
      if (computedInstance) {
        const idx = computeds.indexOf(computedInstance);
        if (idx !== -1) {
          computedInstance.invalidate();
          const expected = depMap[idx]?.reduce((sum, dependency) => sum + dependency.value, 0);
          expect(computedInstance.value).toBe(expected);
        }
      }
    }
  });
});
