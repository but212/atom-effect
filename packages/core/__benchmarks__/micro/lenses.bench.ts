/**
 * @fileoverview Micro-benchmarks for atom-effect core Lens API
 * @description Standardized performance metrics for lens read/write operations and composition scaling.
 */

import { bench, describe } from 'vitest';
import { atom, atomLens, composeLens, computed } from '../../dist';
import { keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Lenses: Structural Access', () => {
  const plainSource = { a: { b: { c: 1 } } };
  const source = atom({ a: { b: { c: 1 } } });
  const lens = atomLens(source, 'a.b.c');
  const comp = computed(() => source.value.a.b.c);
  let compUnsub: () => void;

  const readCases = [
    { name: 'baseline: raw nested object read', read: () => plainSource.a.b.c },
    { name: 'read: lens', read: () => lens.value },
    { name: 'read: computed active', read: () => comp.value },
    { name: 'read: direct object access', read: () => source.value.a.b.c },
  ];

  for (const { name, read } of readCases) {
    bench(
      `${name} (x${REPEATS})`,
      () => {
        for (let i = 0; i < REPEATS; i++) keep(read());
      },
      {
        ...microBenchOptions,
        setup: () => {
          compUnsub = comp.subscribe(() => {});
        },
        teardown: () => {
          compUnsub();
        },
      }
    );
  }

  const writeCases = [
    {
      name: 'baseline: raw nested object write',
      write: (i: number) => {
        plainSource.a.b.c = i;
      },
    },
    {
      name: 'write: lens',
      write: (i: number) => {
        lens.value = i;
      },
    },
    {
      name: 'write: manual spread',
      write: (i: number) => {
        source.value = {
          ...source.value,
          a: { ...source.value.a, b: { ...source.value.a.b, c: i } },
        };
      },
    },
  ];

  for (const { name, write } of writeCases) {
    bench(
      `${name} (x${REPEATS})`,
      () => {
        for (let i = 0; i < REPEATS; i++) write(i);
      },
      microBenchOptions
    );
  }

  const sharedSource = atom({ x: { y: 1 } });
  const parentLens = atomLens(sharedSource, 'x');
  const composed = composeLens(parentLens, 'y');
  let manyLensesUnsub: (() => void)[] = [];

  let val = 0;
  bench(
    `composition & scaling (100 active lenses)`,
    () => {
      sharedSource.value = { x: { y: ++val } };
      keep(composed.value);
    },
    {
      ...microBenchOptions,
      setup: () => {
        manyLensesUnsub = Array.from({ length: 100 }, () => {
          const l = atomLens(sharedSource, 'x.y');
          return l.subscribe(() => {});
        });
      },
      teardown: () => {
        for (const unsubscribeCallback of manyLensesUnsub) unsubscribeCallback();
        manyLensesUnsub = [];
      },
    }
  );
});
