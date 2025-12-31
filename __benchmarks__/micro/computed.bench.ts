/**
 * @fileoverview Computed micro-benchmarks
 * @description Benchmarks for computed value operations
 */

import { bench, describe } from 'vitest';
import { atom, computed } from '../../src/index.js';
import { microBenchOptions } from '../utils/setup.js';

describe('Computed Creation', () => {
  bench(
    'create computed (single dependency)',
    () => {
      const a = atom(0);
      void computed(() => a.value * 2);
    },
    microBenchOptions
  );

  bench(
    'create computed (3 dependencies)',
    () => {
      const a = atom(1);
      const b = atom(2);
      const c = atom(3);
      void computed(() => a.value + b.value + c.value);
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
  bench(
    'computed reads single dependency',
    () => {
      const a = atom(42);
      const c = computed(() => a.value * 2);
      void c.value;
    },
    microBenchOptions
  );

  bench(
    'computed reads multiple dependencies',
    () => {
      const a = atom(1);
      const b = atom(2);
      const c = atom(3);
      const sum = computed(() => a.value + b.value + c.value);
      void sum.value;
    },
    microBenchOptions
  );

  bench(
    'computed with nested computations',
    () => {
      const a = atom(10);
      const doubled = computed(() => a.value * 2);
      const quadrupled = computed(() => doubled.value * 2);
      void quadrupled.value;
    },
    microBenchOptions
  );
});

describe('Computed Recomputation', () => {
  bench(
    'trigger recomputation (single dependency)',
    () => {
      const a = atom(0);
      const c = computed(() => a.value * 2);
      void c.value; // Initial computation
      a.value = 1; // Trigger recomputation
      void c.value; // Read new value
    },
    microBenchOptions
  );

  bench(
    'trigger recomputation (chain of 10)',
    () => {
      const a = atom(0);
      let current = computed(() => a.value);
      for (let i = 0; i < 9; i++) {
        const prev = current;
        current = computed(() => prev.value + 1);
      }
      void current.value; // Initial computation
      a.value = 1; // Trigger recomputation
      void current.value; // Read new value
    },
    microBenchOptions
  );

  bench(
    'no recomputation when value unchanged',
    () => {
      const a = atom(42);
      const c = computed(() => a.value * 2);
      void c.value; // Initial computation
      a.value = 42; // Same value, should not trigger recomputation
      void c.value; // Should return cached value
    },
    microBenchOptions
  );
});

describe('Computed Lazy Evaluation', () => {
  bench(
    'lazy computed (not accessed)',
    () => {
      const a = atom(0);
      void computed(() => a.value * 2, { lazy: true });
      // Don't access c.value
    },
    microBenchOptions
  );

  bench(
    'lazy computed (accessed once)',
    () => {
      const a = atom(0);
      const c = computed(() => a.value * 2, { lazy: true });
      void c.value; // First access triggers computation
    },
    microBenchOptions
  );

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
  bench(
    'invalidate cache (single dependency)',
    () => {
      const a = atom(0);
      const c = computed(() => a.value * 2);
      void c.value; // Initial read
      a.value = 1; // Invalidate cache
      void c.value; // Recompute
    },
    microBenchOptions
  );

  bench(
    'partial invalidation (diamond dependency)',
    () => {
      const a = atom(1);
      const b = computed(() => a.value * 2);
      const c = computed(() => a.value * 3);
      const d = computed(() => b.value + c.value);

      void d.value; // Initial computation
      a.value = 2; // Invalidate all
      void d.value; // Recompute
    },
    microBenchOptions
  );
});

describe('Computed Disposal', () => {
  bench(
    'dispose computed',
    () => {
      const a = atom(0);
      const c = computed(() => a.value * 2);
      c.dispose();
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
