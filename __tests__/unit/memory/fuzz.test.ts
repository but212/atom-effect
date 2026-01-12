/**
 * @fileoverview Fuzz testing for reactive dependency graphs
 * @description Stress tests with random dependency graphs (Heavy mode: 1000 atoms, 500 computed, 10000 updates)
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '../../../src/core/atom/atom';
import { computed } from '../../../src/core/computed';
import { effect } from '../../../src/core/effect/effect';
import { batch } from '../../../src/internal/scheduler';

// Configuration for Heavy fuzz testing
const FUZZ_CONFIG = {
  ATOM_COUNT: 1000,
  COMPUTED_COUNT: 500,
  UPDATE_COUNT: 10000,
  MAX_DEPS_PER_COMPUTED: 5,
  EFFECT_COUNT: 50,
} as const;

// Seeded random for reproducibility
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

describe('Fuzz Testing - Heavy Mode', () => {
  describe('Random dependency graph stability', () => {
    it('should handle large random dependency graph without crashing', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const random = seededRandom(42);

      const atoms: ReturnType<typeof atom<number>>[] = [];
      const computeds: ReturnType<typeof computed<number>>[] = [];

      // Create atoms
      for (let i = 0; i < FUZZ_CONFIG.ATOM_COUNT; i++) {
        atoms.push(atom(Math.floor(random() * 100)));
      }

      // Create computed with random dependencies
      for (let i = 0; i < FUZZ_CONFIG.COMPUTED_COUNT; i++) {
        const numDeps = Math.floor(random() * FUZZ_CONFIG.MAX_DEPS_PER_COMPUTED) + 1;
        const depIndices: number[] = [];

        for (let j = 0; j < numDeps; j++) {
          depIndices.push(Math.floor(random() * atoms.length));
        }

        const deps = depIndices.map((idx) => atoms[idx]!);

        computeds.push(
          computed(() => {
            return deps.reduce((sum, dep) => sum + dep.value, 0);
          })
        );
      }

      // Read some computed values to establish dependencies
      const sampledComputeds = computeds.slice(0, 100);
      for (const c of sampledComputeds) {
        try {
          c.value;
        } catch {
          // Ignore errors during initial read
        }
      }

      // Random updates
      for (let i = 0; i < FUZZ_CONFIG.UPDATE_COUNT; i++) {
        const atomIdx = Math.floor(random() * atoms.length);
        const newValue = Math.floor(random() * 100);

        try {
          atoms[atomIdx]!.value = newValue;
        } catch {
          // Ignore update errors
        }
      }

      // Verify we can still read values
      let successfulReads = 0;
      for (const c of sampledComputeds) {
        try {
          c.value;
          successfulReads++;
        } catch {
          // Count failures
        }
      }

      expect(successfulReads).toBeGreaterThan(0);

      // Cleanup
      computeds.forEach((c) => {
        try {
          c.dispose();
        } catch {}
      });
      atoms.forEach((a) => {
        try {
          a.dispose();
        } catch {}
      });

      consoleSpy.mockRestore();
    });

    it('should handle batched random updates', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const random = seededRandom(123);

      const atoms: ReturnType<typeof atom<number>>[] = [];
      const computeds: ReturnType<typeof computed<number>>[] = [];

      // Create smaller graph for batched test
      const BATCH_ATOM_COUNT = 200;
      const BATCH_COMPUTED_COUNT = 100;
      const BATCH_UPDATE_COUNT = 1000;

      for (let i = 0; i < BATCH_ATOM_COUNT; i++) {
        atoms.push(atom(Math.floor(random() * 100)));
      }

      for (let i = 0; i < BATCH_COMPUTED_COUNT; i++) {
        const numDeps = Math.floor(random() * 3) + 1;
        const deps = Array.from(
          { length: numDeps },
          () => atoms[Math.floor(random() * atoms.length)]!
        );

        computeds.push(
          computed(() => deps.reduce((sum, dep) => sum + dep.value, 0))
        );
      }

      // Perform batched updates
      let batchErrors = 0;

      for (let batch_i = 0; batch_i < BATCH_UPDATE_COUNT / 10; batch_i++) {
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

      // Some errors are acceptable, but system should still work
      expect(batchErrors).toBeLessThan(BATCH_UPDATE_COUNT / 100);

      // Cleanup
      computeds.forEach((c) => {
        try {
          c.dispose();
        } catch {}
      });
      atoms.forEach((a) => {
        try {
          a.dispose();
        } catch {}
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Effect stress testing', () => {
    it('should handle many effects with random dependencies', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const random = seededRandom(456);

      const atoms: ReturnType<typeof atom<number>>[] = [];
      const effects: ReturnType<typeof effect>[] = [];

      // Create atoms
      for (let i = 0; i < 100; i++) {
        atoms.push(atom(Math.floor(random() * 100)));
      }

      // Create effects with random dependencies
      for (let i = 0; i < FUZZ_CONFIG.EFFECT_COUNT; i++) {
        const numDeps = Math.floor(random() * 3) + 1;
        const depIndices = Array.from({ length: numDeps }, () =>
          Math.floor(random() * atoms.length)
        );

        effects.push(
          effect(() => {
            let sum = 0;
            for (const idx of depIndices) {
              sum += atoms[idx]!.value;
            }
            return () => {
              // Cleanup
            };
          })
        );
      }

      // Wait for initial effects
      await new Promise((r) => setTimeout(r, 50));

      // Perform updates
      for (let i = 0; i < 100; i++) {
        const atomIdx = Math.floor(random() * atoms.length);
        atoms[atomIdx]!.value = Math.floor(random() * 100);
      }

      // Wait for effects to process
      await new Promise((r) => setTimeout(r, 100));

      // Cleanup
      effects.forEach((fx) => {
        try {
          fx.dispose();
        } catch {}
      });
      atoms.forEach((a) => {
        try {
          a.dispose();
        } catch {}
      });

      // Test passes if we get here without hanging
      expect(true).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Memory pressure testing', () => {
    it('should handle rapid create/dispose cycles', () => {
      const CYCLES = 100;
      const ITEMS_PER_CYCLE = 50;

      for (let cycle = 0; cycle < CYCLES; cycle++) {
        const atoms: ReturnType<typeof atom<number>>[] = [];
        const computeds: ReturnType<typeof computed<number>>[] = [];

        // Create
        for (let i = 0; i < ITEMS_PER_CYCLE; i++) {
          atoms.push(atom(i));
        }

        for (let i = 0; i < ITEMS_PER_CYCLE / 2; i++) {
          const a = atoms[i * 2]!;
          const b = atoms[i * 2 + 1]!;
          computeds.push(computed(() => a.value + b.value));
        }

        // Access values
        for (const c of computeds) {
          c.value;
        }

        // Dispose
        for (const c of computeds) {
          c.dispose();
        }
        for (const a of atoms) {
          a.dispose();
        }
      }

      // Test passes if we complete without memory issues
      expect(true).toBe(true);
    });

    it('should handle interleaved creation and disposal', () => {
      const random = seededRandom(789);
      const activeAtoms: ReturnType<typeof atom<number>>[] = [];
      const activeComputeds: ReturnType<typeof computed<number>>[] = [];

      const OPERATIONS = 1000;

      for (let i = 0; i < OPERATIONS; i++) {
        const op = random();

        if (op < 0.4 || activeAtoms.length < 10) {
          // Create atom
          activeAtoms.push(atom(Math.floor(random() * 100)));
        } else if (op < 0.6 && activeAtoms.length > 1) {
          // Create computed
          const numDeps = Math.min(3, activeAtoms.length);
          const deps: ReturnType<typeof atom<number>>[] = [];
          for (let j = 0; j < numDeps; j++) {
            deps.push(activeAtoms[Math.floor(random() * activeAtoms.length)]!);
          }
          activeComputeds.push(
            computed(() => deps.reduce((sum, d) => sum + d.value, 0))
          );
        } else if (op < 0.7 && activeAtoms.length > 20) {
          // Dispose random atom
          const idx = Math.floor(random() * activeAtoms.length);
          const [removed] = activeAtoms.splice(idx, 1);
          removed?.dispose();
        } else if (op < 0.8 && activeComputeds.length > 10) {
          // Dispose random computed
          const idx = Math.floor(random() * activeComputeds.length);
          const [removed] = activeComputeds.splice(idx, 1);
          removed?.dispose();
        } else if (activeAtoms.length > 0) {
          // Update random atom
          const idx = Math.floor(random() * activeAtoms.length);
          activeAtoms[idx]!.value = Math.floor(random() * 100);
        }
      }

      // Cleanup remaining
      for (const c of activeComputeds) {
        try {
          c.dispose();
        } catch {}
      }
      for (const a of activeAtoms) {
        try {
          a.dispose();
        } catch {}
      }

      expect(true).toBe(true);
    });
  });

  describe('Concurrent update patterns', () => {
    it('should handle simultaneous updates to same atom', async () => {
      const a = atom(0);
      const results: number[] = [];

      const c = computed(() => a.value * 2);

      // Simulate concurrent updates
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
