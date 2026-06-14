/**
 * @fileoverview Micro-benchmarks for atom-effect core type guards
 * @description Standardized performance metrics for isAtom and isComputed checks.
 */

import { bench, describe } from 'vitest';
import { atom, BRAND, BrandFlags, computed, isAtom, isComputed } from '../../dist';
import { keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Type Guards: isAtom / isComputed', () => {
  const a = atom(0);
  const c = computed(() => a.value);
  const e = { [BRAND]: BrandFlags.Effect };
  // Mix of valid and invalid targets to avoid mono-morphic optimization
  const targets = [a, c, e, 0, 'str', null, {}, []];

  const guardCases = [
    {
      name: 'baseline: basic property check',
      check: (t: any) =>
        t !== null && (typeof t === 'object' || typeof t === 'function') && t[BRAND] !== undefined,
    },
    { name: 'isAtom checks', check: isAtom },
    { name: 'isComputed checks', check: isComputed },
  ];

  for (const { name, check } of guardCases) {
    bench(
      `${name} (x${REPEATS * targets.length})`,
      () => {
        for (let i = 0; i < REPEATS; i++) {
          for (const t of targets) keep(check(t));
        }
      },
      microBenchOptions
    );
  }
});
