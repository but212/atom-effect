/**
 * @fileoverview Micro-benchmarks for atom-effect batch updates
 * @description Measures flat vs. nested batch update overhead and sync synchronization.
 */

import { describe, test } from 'vitest';
import { atom, batch, computed, effect } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

const repeats = REPEATS;
const _keep = keep;
const _atom = atom;
const _batch = batch;
const _computed = computed;
const _effect = effect;
const _benchEffectOptions = benchEffectOptions;

describe('Batching: Basic Operations', () => {
  test('basic batch operations', async ({ bench }) => {
    const atoms = Array.from({ length: repeats }, (_, i) => _atom(i));
    let activeEffects: any[] = [];

    const firstAtom = _atom(0);
    const secondAtom = _atom(0);
    const sum = _computed(() => firstAtom.value + secondAtom.value);
    const doubled = _computed(() => sum.value * 2);

    await bench.compare(
      bench(
        `batch update ${repeats} atoms: active (x${repeats})`,
        {
          beforeAll: () => {
            activeEffects = atoms.map((someAtom) =>
              _effect(() => _keep(someAtom.value), _benchEffectOptions)
            );
          },
          afterAll: () => {
            for (const effectInstance of activeEffects) effectInstance.dispose();
            activeEffects = [];
          },
        },
        () => {
          _batch(() => {
            for (const someAtom of atoms) someAtom.value++;
          });
        }
      ),
      bench(`batched computed chain update (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _batch(() => {
            firstAtom.value++;
            secondAtom.value++;
          });
          _keep(doubled.value);
        }
      }),
      microBenchOptions
    );
  });
});

describe('Batching: Nesting Overhead', () => {
  test('nesting overhead comparison', async ({ bench }) => {
    const atoms = Array.from({ length: repeats }, (_, i) => _atom(i));
    let activeEffects: any[] = [];

    const hookOptions = {
      beforeAll: () => {
        activeEffects = atoms.map((someAtom) =>
          _effect(() => _keep(someAtom.value), _benchEffectOptions)
        );
      },
      afterAll: () => {
        for (const effectInstance of activeEffects) effectInstance.dispose();
        activeEffects = [];
      },
    };

    await bench.compare(
      bench(`unbatched ${repeats} writes`, hookOptions, () => {
        for (const someAtom of atoms) someAtom.value++;
      }),
      bench(`flat batch (${repeats} writes)`, hookOptions, () => {
        _batch(() => {
          for (const someAtom of atoms) someAtom.value++;
        });
      }),
      bench(`nested batch 3 levels (${repeats} writes)`, hookOptions, () => {
        _batch(() =>
          _batch(() =>
            _batch(() => {
              for (const someAtom of atoms) someAtom.value++;
            })
          )
        );
      }),
      microBenchOptions
    );
  });
});
