/**
 * @fileoverview Deterministic Fuzz Testing
 * @description Generates random dependency graphs and mutations to find edge cases.
 * deterministically seeded for reproducibility.
 */

import { seededRandom } from '@tests/utils/test-helpers';
import { describe, expect, it } from 'vitest';
import { atom, batch, type ComputedAtom, computed, type WritableAtom } from '@/index';

function buildGraph(rand: () => number, atomCount = 5, computedCount = 20) {
  const atoms: WritableAtom<number>[] = [];
  const computeds: ComputedAtom<number>[] = [];
  const allNodes: (WritableAtom<number> | ComputedAtom<number>)[] = [];
  const depMap: (WritableAtom<number> | ComputedAtom<number>)[][] = [];

  for (let i = 0; i < atomCount; i++) {
    const a = atom(i);
    atoms.push(a);
    allNodes.push(a);
  }

  for (let i = 0; i < computedCount; i++) {
    const numDeps = Math.floor(rand() * 3) + 1;
    const deps: (WritableAtom<number> | ComputedAtom<number>)[] = [];
    for (let j = 0; j < numDeps; j++) {
      const dep = allNodes[Math.floor(rand() * allNodes.length)];
      if (dep) deps.push(dep);
    }
    depMap.push(deps);
    const c = computed(() => deps.reduce((sum, d) => sum + d.value, 0));
    computeds.push(c);
    allNodes.push(c);
  }

  return { atoms, computeds, depMap };
}

describe('Fuzz Testing (Deterministic)', () => {
  it('computed values stay finite after random mutations', () => {
    const rand = seededRandom(12345);
    const { atoms, computeds } = buildGraph(rand);

    for (let i = 0; i < 100; i++) {
      const targetAtom = atoms[Math.floor(rand() * atoms.length)];
      if (targetAtom) targetAtom.value = Math.floor(rand() * 100);

      const targetComputed = computeds[Math.floor(rand() * computeds.length)];
      if (targetComputed) expect(Number.isFinite(targetComputed.value)).toBe(true);
    }
  });

  it('batch mutations produce glitch-free final state across the graph', () => {
    const rand = seededRandom(77777);
    const { atoms, computeds, depMap } = buildGraph(rand, 5, 10);

    for (let i = 0; i < 30; i++) {
      batch(() => {
        for (const a of atoms) {
          a.value = Math.floor(rand() * 100);
        }
      });

      for (let idx = 0; idx < computeds.length; idx++) {
        const c = computeds[idx];
        if (c) {
          const expected = depMap[idx]?.reduce((sum, d) => sum + d.value, 0);
          expect(c.value).toBe(expected);
        }
      }
    }
  });

  it('invalidate forces recomputation to a consistent value', () => {
    const rand = seededRandom(54321);
    const { atoms, computeds, depMap } = buildGraph(rand, 5, 10);

    for (let i = 0; i < 30; i++) {
      const targetAtom = atoms[Math.floor(rand() * atoms.length)];
      if (targetAtom) targetAtom.value = Math.floor(rand() * 100);

      const c = computeds[Math.floor(rand() * computeds.length)];
      if (c) {
        const idx = computeds.indexOf(c);
        if (idx !== -1) {
          c.invalidate();
          const expected = depMap[idx]?.reduce((sum, d) => sum + d.value, 0);
          expect(c.value).toBe(expected);
        }
      }
    }
  });
});
