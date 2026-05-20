/**
 * @fileoverview Micro-benchmarks for atom-effect core Lens API
 * @description Standardized performance metrics for lens read/write operations and composition scaling.
 */

import { bench, describe } from 'vitest';
import { atom, atomLens, composeLens, computed } from '../../dist';
import { keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Lenses: Structural Access', () => {
  const source = atom({ a: { b: { c: 1 } } });
  const lens = atomLens(source, 'a.b.c');
  const comp = computed(() => source.value.a.b.c);
  comp.subscribe(() => {});

  bench(
    `read: lens (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(lens.value);
    },
    microBenchOptions
  );

  bench(
    `read: computed active (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(comp.value);
    },
    microBenchOptions
  );

  bench(
    `read: direct object access (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(source.value.a.b.c);
    },
    microBenchOptions
  );

  bench(
    `write: lens (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) lens.value = i;
    },
    microBenchOptions
  );

  bench(
    `write: manual spread (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        source.value = {
          ...source.value,
          a: { ...source.value.a, b: { ...source.value.a.b, c: i } },
        };
      }
    },
    microBenchOptions
  );

  const sharedSource = atom({ x: { y: 1 } });
  const parentLens = atomLens(sharedSource, 'x');
  const composed = composeLens(parentLens, 'y');
  const manyLenses = Array.from({ length: 100 }, () => {
    const l = atomLens(sharedSource, 'x.y');
    l.subscribe(() => {});
    return l;
  });

  bench(
    `composition & scaling (100 active lenses)`,
    () => {
      sharedSource.value = { x: { y: 2 } };
      keep([composed.value, manyLenses.length]);
    },
    microBenchOptions
  );
});
