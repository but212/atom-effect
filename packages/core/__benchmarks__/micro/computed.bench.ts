/**
 * @fileoverview Computed micro-benchmarks
 * @description Benchmarks for computed value operations
 */

import { bench, describe } from 'vitest';
import { atom, computed } from '../../dist';
import { microBenchOptions } from '../utils/setup.js';

const REPEATS = 1000;

describe('Computed Creation', () => {
  bench(
    `create computed (single dependency) (x${REPEATS})`,
    () => {
      let c;
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        c = computed(() => a.value * 2);
      }
      return c as any;
    },
    microBenchOptions
  );

  bench(
    `create computed (3 dependencies) (x${REPEATS})`,
    () => {
      let res;
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(1);
        const b = atom(2);
        const c = atom(3);
        res = computed(() => a.value + b.value + c.value);
      }
      return res as any;
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
      return current.value as any;
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
    `computed reads single dependency (x${REPEATS})`,
    () => {
      let val;
      for (let i = 0; i < REPEATS; i++) {
        val = cSingle.value;
      }
      return val as any;
    },
    microBenchOptions
  );

  bench(
    `computed reads multiple dependencies (x${REPEATS})`,
    () => {
      let val;
      for (let i = 0; i < REPEATS; i++) {
        val = cMultiple.value;
      }
      return val as any;
    },
    microBenchOptions
  );

  bench(
    `computed with nested computations (x${REPEATS})`,
    () => {
      let val;
      for (let i = 0; i < REPEATS; i++) {
        val = cQuadrupled.value;
      }
      return val as any;
    },
    microBenchOptions
  );
});

describe('Computed Recomputation', () => {
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
    `trigger recomputation (single dependency) (x${REPEATS})`,
    () => {
      let val;
      for (let i = 0; i < REPEATS; i++) {
        a.value += 1;
        val = c.value;
      }
      return val as any;
    },
    microBenchOptions
  );

  bench(
    `trigger recomputation (chain of 10) (x${REPEATS})`,
    () => {
      let result: any;
      for (let i = 0; i < REPEATS; i++) {
        aChain.value += 1;
        result = currentChain.value;
      }
      return result;
    },
    microBenchOptions
  );

  bench(
    `no recomputation when value unchanged (x${REPEATS})`,
    () => {
      let val: any;
      for (let i = 0; i < REPEATS; i++) {
        aNoChange.value = 42;
        val = cNoChange.value;
      }
      return val;
    },
    microBenchOptions
  );
});

describe('Computed Lazy Evaluation', () => {
  bench(
    `lazy computed (not accessed) (x${REPEATS})`,
    () => {
      let res;
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        res = computed(() => a.value * 2, { lazy: true });
      }
      return res as any;
    },
    microBenchOptions
  );

  bench(
    `lazy computed (accessed once) (x${REPEATS})`,
    () => {
      let val;
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        const c = computed(() => a.value * 2, { lazy: true });
        val = c.value;
      }
      return val as any;
    },
    microBenchOptions
  );

  bench(
    `lazy computed (accessed multiple times) (x${REPEATS})`,
    () => {
      let val;
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        const c = computed(() => a.value * 2, { lazy: true });
        void c.value;
        void c.value;
        val = c.value;
      }
      return val as any;
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
    `invalidate cache (single dependency) (x${REPEATS})`,
    () => {
      let val;
      for (let i = 0; i < REPEATS; i++) {
        a.value += 1;
        val = c.value; // Force re-eval
      }
      return val as any;
    },
    microBenchOptions
  );

  bench(
    `partial invalidation (diamond dependency) (x${REPEATS})`,
    () => {
      let val;
      for (let i = 0; i < REPEATS; i++) {
        aDiamond.value += 1;
        val = dDiamond.value;
      }
      return val as any;
    },
    microBenchOptions
  );
});

describe('Computed Disposal', () => {
  // Keep disposal benchmarks as is (create + dispose) to measure cleanup cost
  bench(
    `dispose computed (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        const c = computed(() => a.value * 2);
        c.dispose();
      }
    },
    microBenchOptions
  );

  bench(
    `dispose computed chain (x${REPEATS})`,
    () => {
      let lastValue: any;
      for (let j = 0; j < REPEATS; j++) {
        const a = atom(0);
        const computeds = [computed(() => a.value)];
        for (let i = 0; i < 9; i++) {
          const prev = computeds[i]!;
          computeds.push(computed(() => prev.value + 1));
        }
        lastValue = computeds[computeds.length - 1]!.value;
        computeds.forEach((c) => c.dispose());
      }
      return lastValue;
    },
    microBenchOptions
  );
});
