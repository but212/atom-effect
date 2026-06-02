/**
 * @fileoverview Micro-benchmarks for atom-effect batch updates
 * @description Measures flat vs. nested batch update overhead and sync synchronization.
 */

import { bench, describe } from 'vitest';
import { atom, batch, computed, effect } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Batching: Basic Operations', () => {
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
  for (const atom of atoms) {
    effect(() => keep(atom.value), benchEffectOptions);
  }

  bench(
    `batch update ${REPEATS} atoms: active (x${REPEATS})`,
    () => {
      batch(() => {
        for (let i = 0; i < REPEATS; i++) {
          const at = atoms[i];
          if (at) at.value++;
        }
      });
    },
    microBenchOptions
  );

  const a = atom(0);
  const b = atom(0);
  const sum = computed(() => a.value + b.value);
  const doubled = computed(() => sum.value * 2);

  bench(
    `batched computed chain update (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        batch(() => {
          a.value++;
          b.value++;
        });
        keep(doubled.value);
      }
    },
    microBenchOptions
  );
});

describe('Batching: Nesting Overhead', () => {
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
  for (const a of atoms) {
    effect(() => keep(a.value), benchEffectOptions);
  }

  bench(
    `unbatched ${REPEATS} writes`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const at = atoms[i];
        if (at) at.value++;
      }
    },
    microBenchOptions
  );

  bench(
    `flat batch (${REPEATS} writes)`,
    () => {
      batch(() => {
        for (let i = 0; i < REPEATS; i++) {
          const at = atoms[i];
          if (at) at.value++;
        }
      });
    },
    microBenchOptions
  );

  bench(
    `nested batch 3 levels (${REPEATS} writes)`,
    () => {
      batch(() =>
        batch(() =>
          batch(() => {
            for (let i = 0; i < REPEATS; i++) {
              const at = atoms[i];
              if (at) at.value++;
            }
          })
        )
      );
    },
    microBenchOptions
  );
});
