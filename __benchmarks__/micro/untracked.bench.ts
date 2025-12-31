/**
 * @fileoverview Untracked micro-benchmarks
 * @description Benchmarks for untracked read operations
 */

import { bench, describe } from 'vitest';
import { atom, computed, untracked } from '../../src/index.js';
import { microBenchOptions } from '../utils/setup.js';

describe('Untracked Reads', () => {
  bench(
    'untracked read single atom',
    () => {
      const a = atom(42);
      const value = untracked(() => a.value);
      return value;
    },
    microBenchOptions
  );

  bench(
    'untracked read multiple atoms',
    () => {
      const a = atom(1);
      const b = atom(2);
      const c = atom(3);
      const sum = untracked(() => a.value + b.value + c.value);
      return sum;
    },
    microBenchOptions
  );

  bench(
    'untracked peek vs value',
    () => {
      const a = atom(42);
      const peeked = a.peek();
      const untracked_value = untracked(() => a.value);
      return peeked + untracked_value;
    },
    microBenchOptions
  );
});

describe('Tracked vs Untracked', () => {
  bench(
    'tracked: computed with 3 dependencies',
    () => {
      const a = atom(1);
      const b = atom(2);
      const c = atom(3);
      const sum = computed(() => a.value + b.value + c.value);
      const _ = sum.value;
      a.value = 10; // Triggers recomputation
      const __ = sum.value;
      return __;
    },
    microBenchOptions
  );

  bench(
    'untracked: computed ignores dependencies',
    () => {
      const a = atom(1);
      const b = atom(2);
      const c = atom(3);
      const sum = computed(() => untracked(() => a.value + b.value + c.value));
      const _ = sum.value;
      a.value = 10; // Does NOT trigger recomputation
      const __ = sum.value;
      return __;
    },
    microBenchOptions
  );
});

describe('Mixed Tracked and Untracked', () => {
  bench(
    'computed with partial tracking',
    () => {
      const tracked1 = atom(1);
      const tracked2 = atom(2);
      const untracked1 = atom(10);
      const untracked2 = atom(20);

      const result = computed(
        () => tracked1.value + tracked2.value + untracked(() => untracked1.value + untracked2.value)
      );

      const _ = result.value;
      tracked1.value = 5; // Triggers recomputation
      const __ = result.value;
      untracked1.value = 100; // Does NOT trigger recomputation
      const ___ = result.value;
      return ___;
    },
    microBenchOptions
  );

  bench(
    'nested untracked reads',
    () => {
      const a = atom(1);
      const b = atom(2);
      const c = atom(3);

      const value = untracked(() => {
        const av = a.value;
        return untracked(() => {
          const bv = b.value;
          return untracked(() => {
            const cv = c.value;
            return av + bv + cv;
          });
        });
      });

      return value;
    },
    microBenchOptions
  );
});

describe('Untracked Performance', () => {
  bench(
    'computed with 100% tracking',
    () => {
      const atoms = Array.from({ length: 10 }, () => atom(0));
      const sum = computed(() => atoms.reduce((acc, a) => acc + a.value, 0));
      const _ = sum.value;
      atoms[0].value = 1;
      const __ = sum.value;
      return __;
    },
    microBenchOptions
  );

  bench(
    'computed with 50% tracking',
    () => {
      const trackedAtoms = Array.from({ length: 5 }, () => atom(0));
      const untrackedAtoms = Array.from({ length: 5 }, () => atom(0));

      const sum = computed(
        () =>
          trackedAtoms.reduce((acc, a) => acc + a.value, 0) +
          untracked(() => untrackedAtoms.reduce((acc, a) => acc + a.value, 0))
      );

      const _ = sum.value;
      trackedAtoms[0].value = 1;
      const __ = sum.value;
      untrackedAtoms[0].value = 1; // No recomputation
      const ___ = sum.value;
      return ___;
    },
    microBenchOptions
  );

  bench(
    'computed with 0% tracking',
    () => {
      const atoms = Array.from({ length: 10 }, () => atom(0));
      const sum = computed(() => untracked(() => atoms.reduce((acc, a) => acc + a.value, 0)));
      const _ = sum.value;
      atoms[0].value = 1; // No recomputation
      const __ = sum.value;
      return __;
    },
    microBenchOptions
  );
});
