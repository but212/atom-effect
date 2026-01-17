/**
 * @fileoverview Dependency graph macro-benchmark
 * @description Large dependency graphs with various patterns
 */

import { bench, describe } from 'vitest';
import { atom, computed } from '../../src/index.js';
import { macroBenchOptions } from '../utils/setup.js';

describe('Dependency Chain Patterns', () => {
  bench(
    'deep chain (100 levels)',
    () => {
      const a = atom(0);
      let current = computed(() => a.value);

      // Create chain of 100 computed values
      for (let i = 1; i < 100; i++) {
        const prev = current;
        current = computed(() => prev.value + 1);
      }

      // Trigger full chain recomputation
      const _ = current.value;
      a.value = 1;
      const __ = current.value;
    },
    macroBenchOptions
  );

  bench(
    'wide fan-out (1 atom → 100 computeds)',
    () => {
      const a = atom(0);
      const computeds = Array.from({ length: 100 }, (_, i) => computed(() => a.value * (i + 1)));

      // Trigger all recomputations
      computeds.forEach((c) => {
        const _ = c.value;
      });

      a.value = 1;

      computeds.forEach((c) => {
        const _ = c.value;
      });
    },
    macroBenchOptions
  );

  bench(
    'diamond dependency pattern',
    () => {
      const a = atom(1);

      // Level 1: 10 computeds depend on a
      const level1 = Array.from({ length: 10 }, (_, i) => computed(() => a.value * (i + 1)));

      // Level 2: 10 computeds depend on level1
      const level2 = Array.from({ length: 10 }, (_, i) => computed(() => level1[i].value * 2));

      // Final: 1 computed depends on all level2
      const final = computed(() => level2.reduce((sum, c) => sum + c.value, 0));

      const _ = final.value;
      a.value = 2;
      const __ = final.value;
    },
    macroBenchOptions
  );

  bench(
    'pyramid dependency pattern (50 levels)',
    () => {
      const base = Array.from({ length: 50 }, (_, i) => atom(i));

      let currentLevel: ReturnType<typeof computed<number>>[] = base.map((a) =>
        computed(() => a.value)
      );

      // Build pyramid
      for (let level = 1; level < 50; level++) {
        const nextLevel: ReturnType<typeof computed<number>>[] = [];
        for (let i = 0; i < currentLevel.length - 1; i++) {
          const left = currentLevel[i];
          const right = currentLevel[i + 1];
          nextLevel.push(computed(() => left.value + right.value));
        }
        currentLevel = nextLevel;
        if (currentLevel.length === 0) break;
      }

      const apex = currentLevel[0];
      const _ = apex.value;

      // Update base
      base[0].value = 100;
      const __ = apex.value;
    },
    macroBenchOptions
  );
});

describe('Complex Graph Patterns', () => {
  bench(
    'mixed dependencies (100 atoms, 200 computeds)',
    () => {
      const atoms = Array.from({ length: 100 }, (_, i) => atom(i));

      // Each computed depends on 2 random atoms
      const computeds = Array.from({ length: 200 }, (_, i) => {
        const idx1 = i % atoms.length;
        const idx2 = (i + 1) % atoms.length;
        return computed(() => atoms[idx1].value + atoms[idx2].value);
      });

      // Read all
      computeds.forEach((c) => {
        const _ = c.value;
      });

      // Update some atoms
      for (let i = 0; i < 10; i++) {
        atoms[i].value = i * 10;
      }

      // Re-read affected computeds
      computeds.forEach((c) => {
        const _ = c.value;
      });
    },
    macroBenchOptions
  );

  bench(
    'circular avoidance pattern',
    () => {
      const a = atom(1);
      const b = atom(2);
      const c = atom(3);

      // a → b → c → a-like pattern (but safe)
      const ab = computed(() => a.value + b.value);
      const bc = computed(() => b.value + c.value);
      const ca = computed(() => c.value + a.value);
      const all = computed(() => ab.value + bc.value + ca.value);

      const _ = all.value;

      // Update should propagate correctly
      a.value = 10;
      const __ = all.value;

      b.value = 20;
      const ___ = all.value;
    },
    macroBenchOptions
  );
});

describe('Dynamic Dependency Patterns', () => {
  bench(
    'conditional dependencies',
    () => {
      const condition = atom(true);
      const a = atom(1);
      const b = atom(2);

      const result = computed(() => (condition.value ? a.value : b.value));

      // Access with condition true
      const _ = result.value;

      // Update a (should trigger)
      a.value = 10;
      const __ = result.value;

      // Switch condition
      condition.value = false;
      const ___ = result.value;

      // Update a (should NOT trigger)
      a.value = 20;
      const ____ = result.value;

      // Update b (should trigger)
      b.value = 30;
      const _____ = result.value;
    },
    macroBenchOptions
  );

  bench(
    'array-based dynamic dependencies',
    () => {
      const selectedIndex = atom(0);
      const values = Array.from({ length: 10 }, (_, i) => atom(i));

      const selected = computed(() => values[selectedIndex.value].value);

      // Access different indices
      for (let i = 0; i < 10; i++) {
        selectedIndex.value = i;
        const _ = selected.value;
      }

      // Update values
      values.forEach((v, i) => {
        v.value = i * 10;
      });

      // Re-access
      const _ = selected.value;
    },
    macroBenchOptions
  );
});
