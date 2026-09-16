/**
 * @fileoverview Micro-benchmarks for atom-effect core Lens API
 * @description Standardized performance metrics for lens read/write operations and composition scaling.
 */

import { describe, test } from 'vitest';
import { atom, atomLens, composeLens, computed } from '../../dist';
import { keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Lenses: Structural Access', () => {
  test('read cases comparison', async ({ bench }) => {
    const plainSource = { a: { b: { c: 1 } } };
    const source = atom({ a: { b: { c: 1 } } });
    const lens = atomLens(source, 'a.b.c');
    const computedInstance = computed(() => source.value.a.b.c);
    let computedUnsubscribe: () => void;

    const readCases = [
      { name: 'baseline: raw nested object read', read: () => plainSource.a.b.c },
      { name: 'read: lens', read: () => lens.value },
      { name: 'read: computed active', read: () => computedInstance.value },
      { name: 'read: direct object access', read: () => source.value.a.b.c },
    ];

    await bench.compare(
      ...readCases.map(({ name, read }) =>
        bench(
          `${name} (x${REPEATS})`,
          {
            beforeAll: () => {
              computedUnsubscribe = computedInstance.subscribe(() => {});
            },
            afterAll: () => {
              computedUnsubscribe();
            },
          },
          () => {
            for (let i = 0; i < REPEATS; i++) keep(read());
          }
        )
      ),
      microBenchOptions
    );
  });

  test('write cases comparison', async ({ bench }) => {
    const plainSource = { a: { b: { c: 1 } } };
    const source = atom({ a: { b: { c: 1 } } });
    const lens = atomLens(source, 'a.b.c');

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

    await bench.compare(
      ...writeCases.map(({ name, write }) =>
        bench(`${name} (x${REPEATS})`, () => {
          for (let i = 0; i < REPEATS; i++) write(i);
        })
      ),
      microBenchOptions
    );
  });

  test('composition and scaling', async ({ bench }) => {
    const sharedSource = atom({ x: { y: 1 } });
    const parentLens = atomLens(sharedSource, 'x');
    const composed = composeLens(parentLens, 'y');
    let manyLensesUnsub: (() => void)[] = [];
    let value = 0;

    await bench(
      'composition & scaling (100 active lenses)',
      {
        beforeAll: () => {
          manyLensesUnsub = Array.from({ length: 100 }, () => {
            const lensInstance = atomLens(sharedSource, 'x.y');
            return lensInstance.subscribe(() => {});
          });
        },
        afterAll: () => {
          for (const unsubscribeCallback of manyLensesUnsub) unsubscribeCallback();
          manyLensesUnsub = [];
        },
      },
      () => {
        sharedSource.value = { x: { y: ++value } };
        keep(composed.value);
      }
    ).run(microBenchOptions);
  });
});
