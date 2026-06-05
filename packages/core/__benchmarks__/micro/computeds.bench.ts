/**
 * @fileoverview Micro-benchmarks for atom-effect core Computed API
 * @description Standardized performance metrics for computed creation, caching, and evaluation overhead.
 */

import { bench, describe } from 'vitest';
import { atom, computed } from '../../dist';
import { keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Computeds: Reactive Logic', () => {
  bench(
    `creation: flat vs chain (10 levels)`,
    () => {
      const a = atom(0);
      const b = atom(1);
      const c = atom(2);
      // Flat
      keep(computed(() => a.value + b.value + c.value));
      // Chain
      let current = computed(() => a.value);
      for (let i = 0; i < 9; i++) {
        const prev = current;
        current = computed(() => prev.value + 1);
      }
      keep(current.value);
    },
    microBenchOptions
  );

  const source = atom(0);
  const chain10 = (() => {
    let curr = computed(() => source.value);
    for (let i = 0; i < 9; i++) {
      const prev = curr;
      curr = computed(() => prev.value + 1);
    }
    return curr;
  })();

  bench(
    `recomputation & cache (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        source.value++;
        keep(chain10.value); // Recompute
        keep(chain10.value); // Cache hit
      }
    },
    microBenchOptions
  );

  bench(
    `lazy evaluation overhead (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(i);
        const c = computed(() => a.value * 2, { lazy: true });
        keep(c.value);
      }
    },
    microBenchOptions
  );
});

describe('Computeds: Read Methods (.value vs .peek())', () => {
  const a = atom(42);
  const c = computed(() => a.value + 1);
  c.subscribe(() => {}); // keep active

  bench(
    `computed.value read (active, x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) sum += c.value;
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `computed.peek() read (active, x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) sum += c.peek();
      keep(sum);
    },
    microBenchOptions
  );
});

describe('Computeds: Asynchronous Flows', () => {
  // Pre-resolved async computed for testing read overhead
  const resolvedAsync = computed(async () => 42, { defaultValue: 0 });
  resolvedAsync.subscribe(() => {}); // keep active
  resolvedAsync.value; // trigger evaluation

  bench(
    `creation: async computed (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const c = computed(async () => 42, { defaultValue: 0 });
        keep(c);
        c.dispose();
      }
    },
    microBenchOptions
  );

  bench(
    `read: resolved value & state (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(resolvedAsync.value);
        keep(resolvedAsync.state);
      }
    },
    microBenchOptions
  );

  bench(
    'resolution: promise resolving lifecycle',
    async () => {
      let resolve!: (v: number) => void;
      const promise = new Promise<number>((r) => {
        resolve = r;
      });
      const c = computed(() => promise, { defaultValue: 0 });
      c.subscribe(() => {}); // keep active

      try {
        keep(c.value); // trigger calculation, transitions to pending
        resolve(42);

        await promise; // wait for promise to settle
        await Promise.resolve(); // wait for computed microtask to resolve
        keep(c.value); // read resolved value
      } finally {
        c.dispose();
      }
    },
    microBenchOptions
  );
});
