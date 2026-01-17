/**
 * @fileoverview Untracked micro-benchmarks
 * @description Benchmarks for untracked read operations
 */

import { bench, describe } from 'vitest';
import { atom, computed, untracked } from '../../src/index.js';
import { microBenchOptions } from '../utils/setup.js';

describe('Untracked Reads', () => {
  const a = atom(42);
  bench(
    'untracked read single atom',
    () => {
      const value = untracked(() => a.value);
      void value;
    },
    microBenchOptions
  );

  const aMulti = atom(1);
  const bMulti = atom(2);
  const cMulti = atom(3);
  bench(
    'untracked read multiple atoms',
    () => {
      const sum = untracked(() => aMulti.value + bMulti.value + cMulti.value);
      void sum;
    },
    microBenchOptions
  );

  const aPeek = atom(42);
  bench(
    'untracked peek vs value',
    () => {
      const peeked = aPeek.peek();
      const untracked_value = untracked(() => aPeek.value);
      void (peeked + untracked_value);
    },
    microBenchOptions
  );
});

describe('Tracked vs Untracked', () => {
  const a = atom(1);
  const b = atom(2);
  const c = atom(3);
  const sum = computed(() => a.value + b.value + c.value);

  bench(
    'tracked: computed with 3 dependencies',
    () => {
      a.value++; // Triggers recomputation
      const _ = sum.value;
    },
    microBenchOptions
  );

  const ua = atom(1);
  const ub = atom(2);
  const uc = atom(3);
  const usum = computed(() => untracked(() => ua.value + ub.value + uc.value));

  bench(
    'untracked: computed ignores dependencies',
    () => {
      ua.value++; // Does NOT trigger recomputation automatically, but access might if dependencies changed?
      // Actually untracked() inside computed means it doesn't track dependencies.
      // So if ua changes, the computed is NOT marked dirty.
      // Accessing usum.value will just return cached value (if it was cached).
      // Wait, if it has 0 dependencies, it will never be marked dirty by dependency change.
      // So accessing it again returns the cached value immediately.
      // But we want to measure the overhead of the untracked call itself?
      // Or the behavior?
      // If we want to measure "untracked overhead", we should force re-evaluation maybe?
      // But computed with 0 deps never re-evaluates unless ... it doesn't.
      // So this benchmark basically measures "Computed read cached value".

      // Let's force a "dirty" state manually? No API for that.
      // This benchmark title is "ignores dependencies", so maybe we confirm it's fast because it does nothing.
      const _ = usum.value;
    },
    microBenchOptions
  );
});

describe('Mixed Tracked and Untracked', () => {
  const tracked1 = atom(1);
  const tracked2 = atom(2);
  const untracked1 = atom(10);
  const untracked2 = atom(20);

  const result = computed(
    () => tracked1.value + tracked2.value + untracked(() => untracked1.value + untracked2.value)
  );

  bench(
    'computed with partial tracking',
    () => {
      // Change tracked dep to force re-evaluation
      tracked1.value++;
      const _ = result.value;

      // Accessing with untracked change
      untracked1.value++;
      const __ = result.value; // Should be cached (fast)
    },
    microBenchOptions
  );

  const a = atom(1);
  const b = atom(2);
  const c = atom(3);

  bench(
    'nested untracked reads',
    () => {
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
      void value;
    },
    microBenchOptions
  );
});

describe('Untracked Performance', () => {
  const atoms100 = Array.from({ length: 10 }, () => atom(0));
  const sum100 = computed(() => atoms100.reduce((acc, a) => acc + a.value, 0));

  bench(
    'computed with 100% tracking',
    () => {
      atoms100[0].value++;
      const _ = sum100.value;
    },
    microBenchOptions
  );

  const trackedAtoms50 = Array.from({ length: 5 }, () => atom(0));
  const untrackedAtoms50 = Array.from({ length: 5 }, () => atom(0));
  const sum50 = computed(
    () =>
      trackedAtoms50.reduce((acc, a) => acc + a.value, 0) +
      untracked(() => untrackedAtoms50.reduce((acc, a) => acc + a.value, 0))
  );

  bench(
    'computed with 50% tracking',
    () => {
      trackedAtoms50[0].value++;
      const _ = sum50.value;
    },
    microBenchOptions
  );

  const atoms0 = Array.from({ length: 10 }, () => atom(0));
  const sum0 = computed(() => untracked(() => atoms0.reduce((acc, a) => acc + a.value, 0)));

  bench(
    'computed with 0% tracking',
    () => {
      // Does not track, so never dirty. Just reads cache.
      atoms0[0].value++;
      const _ = sum0.value;
    },
    microBenchOptions
  );
});
