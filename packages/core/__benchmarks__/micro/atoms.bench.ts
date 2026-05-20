/**
 * @fileoverview Micro-benchmarks for atom-effect core Atom API
 * @description Standardized performance metrics for atoms creation, reads, writes, and peek.
 */

import { bench, describe } from 'vitest';
import { atom, effect, untracked } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Atoms: Core Operations', () => {
  bench(
    `creation: primitive atom (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(atom(i));
    },
    microBenchOptions
  );

  bench(
    `creation: object atom (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(atom({ count: i }));
    },
    microBenchOptions
  );

  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
  // Force active subscriptions to bypass 'size === 0' optimization
  atoms.forEach((a) => effect(() => keep(a.value), benchEffectOptions));

  bench(
    `read/write performance: active (x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) {
        const at = atoms[i];
        if (at) {
          at.value++;
          sum += at.value;
        }
      }
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `untracked read: active (x${REPEATS})`,
    () => {
      untracked(() => {
        let sum = 0;
        for (let i = 0; i < REPEATS; i++) {
          const at = atoms[i];
          if (at) {
            sum += at.value;
          }
        }
        keep(sum);
      });
    },
    microBenchOptions
  );
});

describe('Atoms: Read Methods (.value vs .peek())', () => {
  const a = atom(42);

  bench(
    `atom.value read (x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) sum += a.value;
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `atom.peek() read (x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) sum += a.peek();
      keep(sum);
    },
    microBenchOptions
  );
});
