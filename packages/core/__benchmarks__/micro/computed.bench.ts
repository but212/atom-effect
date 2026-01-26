/**
 * @fileoverview Computed micro-benchmarks
 * @description Benchmarks for computed value operations
 */

import { bench, describe } from 'vitest';
import { atom, computed } from '../../src/index.js';
import { microBenchOptions } from '../utils/setup.js';

describe('Computed Creation', () => {
  bench(
    'create computed (single dependency) (x1000)',
    () => {
      for (let i = 0; i < 1000; i++) {
        const a = atom(0);
        void computed(() => a.value * 2);
      }
    },
    microBenchOptions
  );

  bench(
    'create computed (3 dependencies) (x1000)',
    () => {
      for (let i = 0; i < 1000; i++) {
        const a = atom(1);
        const b = atom(2);
        const c = atom(3);
        void computed(() => a.value + b.value + c.value);
      }
    },
    microBenchOptions
  );

  bench(
    'create 100 computed values (chain)',
    () => {
      const a = atom(0);
      let current = computed(() => a.value);
      for (let i = 0; i < 99; i++) {
        const prev = current;
        current = computed(() => prev.value + 1);
      }
      void current.value;
    },
    microBenchOptions
  );
});

describe('Computed Dependency Tracking', () => {
  // Setup outside
  const a = atom(42);
  const a1 = atom(1),
    a2 = atom(2),
    a3 = atom(3);
  const deepA = atom(10);

  const cSingle = computed(() => a.value * 2);
  const cMultiple = computed(() => a1.value + a2.value + a3.value);
  const cDoubled = computed(() => deepA.value * 2);
  const cQuadrupled = computed(() => cDoubled.value * 2);

  bench(
    'computed reads single dependency (x1000)',
    () => {
      for (let i = 0; i < 1000; i++) {
        void cSingle.value;
      }
    },
    microBenchOptions
  );

  bench(
    'computed reads multiple dependencies (x1000)',
    () => {
      for (let i = 0; i < 1000; i++) {
        void cMultiple.value;
      }
    },
    microBenchOptions
  );

  bench(
    'computed with nested computations (x1000)',
    () => {
      for (let i = 0; i < 1000; i++) {
        void cQuadrupled.value;
      }
    },
    microBenchOptions
  );
});

describe('Computed Recomputation', () => {
  // Recomputation requires triggering an update.
  // We need to set up the graph, then inside bench, modify source and read result.
  const a = atom(0);
  const c = computed(() => a.value * 2);

  const aChain = atom(0);
  let currentChain = computed(() => aChain.value);
  for (let i = 0; i < 9; i++) {
    const prev = currentChain;
    currentChain = computed(() => prev.value + 1);
  }

  const aNoChange = atom(42);
  const cNoChange = computed(() => aNoChange.value * 2);

  bench(
    'trigger recomputation (single dependency)',
    () => {
      a.value += 1;
      void c.value;
    },
    microBenchOptions
  );

  bench(
    'trigger recomputation (chain of 10)',
    () => {
      aChain.value += 1;
      void currentChain.value;
    },
    microBenchOptions
  );

  bench(
    'no recomputation when value unchanged (x1000)',
    () => {
      for (let i = 0; i < 1000; i++) {
        aNoChange.value = 42;
        void cNoChange.value;
      }
    },
    microBenchOptions
  );
});

describe('Computed Lazy Evaluation', () => {
  // Lazy evaluation benchmarks often want to verify cost of creation vs first access.
  // If we lift creation out, we only test access.
  // Testing "lazy creation" specifically should creation inside loop, but we want to test "lazy computation skipping".

  // We can't really benchmark "not accessed" meaningfully if we don't create it in the loop,
  // because "not accessing a pre-existing computed" is literally doing nothing.
  // So we 'll leave creation inside for "lazy (not accessed)" benchmark to enforce that creation is cheap?
  // Actually, standard benchmarks for "lazy" usually mean "how fast is creating it vs creating + calculating".

  bench(
    'lazy computed (not accessed) (x1000)',
    () => {
      for (let i = 0; i < 1000; i++) {
        const a = atom(0);
        void computed(() => a.value * 2, { lazy: true });
      }
    },
    microBenchOptions
  );

  bench(
    'lazy computed (accessed once)',
    () => {
      const a = atom(0);
      const c = computed(() => a.value * 2, { lazy: true });
      void c.value;
    },
    microBenchOptions
  );

  // For multiple access, we can test the caching mechanism.
  bench(
    'lazy computed (accessed multiple times)',
    () => {
      const a = atom(0);
      const c = computed(() => a.value * 2, { lazy: true });
      void c.value;
      void c.value;
      void c.value;
    },
    microBenchOptions
  );
});

describe('Computed Cache Invalidation', () => {
  const a = atom(0);
  const c = computed(() => a.value * 2);

  const aDiamond = atom(1);
  const bDiamond = computed(() => aDiamond.value * 2);
  const cDiamond = computed(() => aDiamond.value * 3);
  const dDiamond = computed(() => bDiamond.value + cDiamond.value);

  bench(
    'invalidate cache (single dependency)',
    () => {
      a.value += 1;
      void c.value; // Force re-eval
    },
    microBenchOptions
  );

  bench(
    'partial invalidation (diamond dependency)',
    () => {
      aDiamond.value += 1;
      void dDiamond.value;
    },
    microBenchOptions
  );
});

describe('Computed Disposal', () => {
  // Keep disposal benchmarks as is (create + dispose) to measure cleanup cost
  bench(
    'dispose computed (x1000)',
    () => {
      for (let i = 0; i < 1000; i++) {
        const a = atom(0);
        const c = computed(() => a.value * 2);
        c.dispose();
      }
    },
    microBenchOptions
  );

  bench(
    'dispose computed chain',
    () => {
      const a = atom(0);
      const computeds = [computed(() => a.value)];
      for (let i = 0; i < 9; i++) {
        const prev = computeds[i];
        computeds.push(computed(() => prev.value + 1));
      }
      computeds.forEach((c) => c.dispose());
    },
    microBenchOptions
  );
});
