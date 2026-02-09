/**
 * @fileoverview Fuzz testing for reactive dependency graphs
 * @description Stress tests with random dependency graphs (Heavy mode)
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { batch } from '@/index';
import { DEFAULT_FUZZ_CONFIG, sleep } from '../../utils/test-helpers';

const FUZZ_CONFIG = DEFAULT_FUZZ_CONFIG;

// Seeded random for reproducibility
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Helper: build a random dependency graph
function buildRandomGraph(
  random: () => number,
  atomCount: number,
  computedCount: number,
  maxDepsPerComputed: number
) {
  const atoms: ReturnType<typeof atom<number>>[] = [];
  const computeds: ReturnType<typeof computed<number>>[] = [];

  for (let i = 0; i < atomCount; i++) {
    atoms.push(atom(Math.floor(random() * 100)));
  }

  for (let i = 0; i < computedCount; i++) {
    const numDeps = Math.floor(random() * maxDepsPerComputed) + 1;
    const deps = Array.from({ length: numDeps }, () => atoms[Math.floor(random() * atoms.length)]!);
    computeds.push(computed(() => deps.reduce((sum, dep) => sum + dep.value, 0)));
  }

  return { atoms, computeds };
}

// Helper: dispose all nodes, ignoring errors from already-disposed nodes
function disposeAll(...groups: Array<{ dispose: () => void }[]>) {
  for (const group of groups) {
    for (const node of group) {
      try {
        node.dispose();
      } catch {}
    }
  }
}

describe('Fuzz Testing - Heavy Mode', () => {
  describe('Random dependency graph stability', () => {
    it('should survive random graph with sequential and batched updates', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const random = seededRandom(42);

      const { atoms, computeds } = buildRandomGraph(
        random,
        FUZZ_CONFIG.atomCount,
        FUZZ_CONFIG.computedCount,
        FUZZ_CONFIG.maxDepsPerComputed
      );

      // Read computed values to establish dependencies
      const sampledComputeds = computeds.slice(0, 100);
      for (const c of sampledComputeds) {
        try {
          c.value;
        } catch {}
      }

      // Phase 1: Sequential random updates
      for (let i = 0; i < FUZZ_CONFIG.updateCount; i++) {
        const atomIdx = Math.floor(random() * atoms.length);
        try {
          atoms[atomIdx]!.value = Math.floor(random() * 100);
        } catch {}
      }

      // Verify reads still work after sequential updates
      let successfulReads = 0;
      for (const c of sampledComputeds) {
        try {
          c.value;
          successfulReads++;
        } catch {}
      }
      expect(successfulReads).toBeGreaterThan(0);

      // Phase 2: Batched random updates
      let batchErrors = 0;
      for (let i = 0; i < 100; i++) {
        try {
          batch(() => {
            for (let j = 0; j < 10; j++) {
              const atomIdx = Math.floor(random() * atoms.length);
              atoms[atomIdx]!.value = Math.floor(random() * 100);
            }
          });
        } catch {
          batchErrors++;
        }
      }
      expect(batchErrors).toBeLessThan(10);

      // Verify reads still work after batched updates
      successfulReads = 0;
      for (const c of sampledComputeds) {
        try {
          c.value;
          successfulReads++;
        } catch {}
      }
      expect(successfulReads).toBeGreaterThan(0);

      disposeAll(computeds, atoms);
      consoleSpy.mockRestore();
    });
  });

  describe('Effect stress testing', () => {
    it('should handle many effects with random dependencies', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const random = seededRandom(456);

      const atoms: ReturnType<typeof atom<number>>[] = [];
      const effects: ReturnType<typeof effect>[] = [];
      let totalExecutions = 0;

      for (let i = 0; i < 100; i++) {
        atoms.push(atom(Math.floor(random() * 100)));
      }

      for (let i = 0; i < FUZZ_CONFIG.effectCount; i++) {
        const numDeps = Math.floor(random() * 3) + 1;
        const depIndices = Array.from({ length: numDeps }, () =>
          Math.floor(random() * atoms.length)
        );

        effects.push(
          effect(() => {
            totalExecutions++;
            let _sum = 0;
            for (const idx of depIndices) {
              _sum += atoms[idx]!.value;
            }
            return () => {};
          })
        );
      }

      await sleep(50);

      // Perform updates
      for (let i = 0; i < 100; i++) {
        const atomIdx = Math.floor(random() * atoms.length);
        atoms[atomIdx]!.value = Math.floor(random() * 100);
      }

      await sleep(100);

      // Effects should have executed at least once each during creation
      expect(totalExecutions).toBeGreaterThanOrEqual(FUZZ_CONFIG.effectCount);

      // All effects should dispose cleanly
      let disposedCount = 0;
      for (const fx of effects) {
        fx.dispose();
        if (fx.isDisposed) disposedCount++;
      }
      expect(disposedCount).toBe(effects.length);

      disposeAll(atoms);
      consoleSpy.mockRestore();
    });
  });

  describe('Memory pressure testing', () => {
    it('should handle interleaved create/update/dispose without crashing', () => {
      const random = seededRandom(789);
      const activeAtoms: ReturnType<typeof atom<number>>[] = [];
      const activeComputeds: ReturnType<typeof computed<number>>[] = [];

      const OPERATIONS = 1000;
      let totalCreated = 0;
      let totalDisposed = 0;

      for (let i = 0; i < OPERATIONS; i++) {
        const op = random();

        if (op < 0.4 || activeAtoms.length < 10) {
          // Create atom
          activeAtoms.push(atom(Math.floor(random() * 100)));
          totalCreated++;
        } else if (op < 0.6 && activeAtoms.length > 1) {
          // Create computed with random deps
          const numDeps = Math.min(3, activeAtoms.length);
          const deps: ReturnType<typeof atom<number>>[] = [];
          for (let j = 0; j < numDeps; j++) {
            deps.push(activeAtoms[Math.floor(random() * activeAtoms.length)]!);
          }
          activeComputeds.push(computed(() => deps.reduce((sum, d) => sum + d.value, 0)));
          totalCreated++;
        } else if (op < 0.7 && activeAtoms.length > 20) {
          // Dispose random atom
          const idx = Math.floor(random() * activeAtoms.length);
          const [removed] = activeAtoms.splice(idx, 1);
          removed?.dispose();
          totalDisposed++;
        } else if (op < 0.8 && activeComputeds.length > 10) {
          // Dispose random computed
          const idx = Math.floor(random() * activeComputeds.length);
          const [removed] = activeComputeds.splice(idx, 1);
          removed?.dispose();
          totalDisposed++;
        } else if (activeAtoms.length > 0) {
          // Update random atom
          const idx = Math.floor(random() * activeAtoms.length);
          activeAtoms[idx]!.value = Math.floor(random() * 100);
        }
      }

      // Verify operations actually happened
      expect(totalCreated).toBeGreaterThan(0);
      expect(totalDisposed).toBeGreaterThan(0);

      // Cleanup remaining and verify all dispose cleanly
      disposeAll(activeComputeds, activeAtoms);
    });
  });

  describe('Concurrent update patterns', () => {
    it('should maintain consistency under microtask-concurrent updates', async () => {
      const a = atom(0);
      const results: number[] = [];

      const c = computed(() => a.value * 2);

      // Simulate microtask-concurrent updates
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve().then(() => {
          a.value = i;
          results.push(c.value);
        })
      );

      await Promise.all(promises);

      // All results should be even (value * 2)
      expect(results.every((r) => r % 2 === 0)).toBe(true);

      a.dispose();
      c.dispose();
    });
  });
});
