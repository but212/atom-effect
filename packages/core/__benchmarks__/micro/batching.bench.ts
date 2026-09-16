/**
 * @fileoverview Micro-benchmarks for atom-effect batch updates
 * @description Measures flat vs. nested batch update overhead and sync synchronization.
 */

import { describe, test } from 'vitest';
import { atom, batch, computed, effect } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Batching: Basic Operations', () => {
  test('basic batch operations', async ({ bench }) => {
    const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
    let activeEffects: any[] = [];

    const firstAtom = atom(0);
    const secondAtom = atom(0);
    const sum = computed(() => firstAtom.value + secondAtom.value);
    const doubled = computed(() => sum.value * 2);

    await bench.compare(
      bench(
        `batch update ${REPEATS} atoms: active (x${REPEATS})`,
        {
          beforeAll: () => {
            activeEffects = atoms.map((someAtom) =>
              effect(() => keep(someAtom.value), benchEffectOptions)
            );
          },
          afterAll: () => {
            for (const effectInstance of activeEffects) effectInstance.dispose();
            activeEffects = [];
          },
        },
        () => {
          batch(() => {
            for (const someAtom of atoms) someAtom.value++;
          });
        }
      ),
      bench(`batched computed chain update (x${REPEATS})`, () => {
        for (let i = 0; i < REPEATS; i++) {
          batch(() => {
            firstAtom.value++;
            secondAtom.value++;
          });
          keep(doubled.value);
        }
      }),
      microBenchOptions
    );
  });
});

describe('Batching: Nesting Overhead', () => {
  test('nesting overhead comparison', async ({ bench }) => {
    const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
    let activeEffects: any[] = [];

    const hookOptions = {
      beforeAll: () => {
        activeEffects = atoms.map((someAtom) =>
          effect(() => keep(someAtom.value), benchEffectOptions)
        );
      },
      afterAll: () => {
        for (const effectInstance of activeEffects) effectInstance.dispose();
        activeEffects = [];
      },
    };

    await bench.compare(
      bench(`unbatched ${REPEATS} writes`, hookOptions, () => {
        for (const someAtom of atoms) someAtom.value++;
      }),
      bench(`flat batch (${REPEATS} writes)`, hookOptions, () => {
        batch(() => {
          for (const someAtom of atoms) someAtom.value++;
        });
      }),
      bench(`nested batch 3 levels (${REPEATS} writes)`, hookOptions, () => {
        batch(() =>
          batch(() =>
            batch(() => {
              for (const someAtom of atoms) someAtom.value++;
            })
          )
        );
      }),
      microBenchOptions
    );
  });
});
