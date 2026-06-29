/**
 * @fileoverview Micro-benchmarks for atom-effect batch updates
 * @description Measures flat vs. nested batch update overhead and sync synchronization.
 */

import { bench, describe } from 'vitest';
import { atom, batch, computed, effect } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Batching: Basic Operations', () => {
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
  let activeEffects: any[] = [];

  bench(
    `batch update ${REPEATS} atoms: active (x${REPEATS})`,
    () => {
      batch(() => {
        for (const someAtom of atoms) someAtom.value++;
      });
    },
    {
      ...microBenchOptions,
      setup: () => {
        activeEffects = atoms.map((someAtom) =>
          effect(() => keep(someAtom.value), benchEffectOptions)
        );
      },
      teardown: () => {
        for (const effectInstance of activeEffects) effectInstance.dispose();
        activeEffects = [];
      },
    }
  );

  const firstAtom = atom(0);
  const secondAtom = atom(0);
  const sum = computed(() => firstAtom.value + secondAtom.value);
  const doubled = computed(() => sum.value * 2);

  bench(
    `batched computed chain update (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        batch(() => {
          firstAtom.value++;
          secondAtom.value++;
        });
        keep(doubled.value);
      }
    },
    microBenchOptions
  );
});

describe('Batching: Nesting Overhead', () => {
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
  let activeEffects: any[] = [];

  const cleanupOptions = {
    ...microBenchOptions,
    setup: () => {
      activeEffects = atoms.map((someAtom) =>
        effect(() => keep(someAtom.value), benchEffectOptions)
      );
    },
    teardown: () => {
      for (const effectInstance of activeEffects) effectInstance.dispose();
      activeEffects = [];
    },
  };

  bench(
    `unbatched ${REPEATS} writes`,
    () => {
      for (const someAtom of atoms) someAtom.value++;
    },
    cleanupOptions
  );

  bench(
    `flat batch (${REPEATS} writes)`,
    () => {
      batch(() => {
        for (const someAtom of atoms) someAtom.value++;
      });
    },
    cleanupOptions
  );

  bench(
    `nested batch 3 levels (${REPEATS} writes)`,
    () => {
      batch(() =>
        batch(() =>
          batch(() => {
            for (const someAtom of atoms) someAtom.value++;
          })
        )
      );
    },
    cleanupOptions
  );
});
