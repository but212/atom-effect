/**
 * @fileoverview Micro-benchmarks for atom-effect core type guards
 * @description Standardized performance metrics for isAtom and isComputed checks.
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect, isAtom, isComputed } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Type Guards: isAtom / isComputed', () => {
  const a = atom(0);
  const c = computed(() => a.value);
  const e = effect(() => keep(a.value), benchEffectOptions);
  // Mix of valid and invalid targets to avoid mono-morphic optimization
  const targets = [a, c, e, 0, 'str', null, {}, []];

  bench(
    `isAtom checks (x${REPEATS * targets.length})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        for (const t of targets) keep(isAtom(t));
      }
    },
    microBenchOptions
  );

  bench(
    `isComputed checks (x${REPEATS * targets.length})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        for (const t of targets) keep(isComputed(t));
      }
    },
    microBenchOptions
  );
});
