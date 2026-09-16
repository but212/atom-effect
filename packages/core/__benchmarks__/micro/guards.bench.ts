/**
 * @fileoverview Micro-benchmarks for atom-effect core type guards
 * @description Standardized performance metrics for isAtom and isComputed checks.
 */

import { describe, test } from 'vitest';
import { atom, BRAND, BrandFlags, computed, isAtom, isComputed } from '../../dist';
import { keep, microBenchOptions, REPEATS } from '../utils/setup.js';

const repeats = REPEATS;
const _keep = keep;
const _isAtom = isAtom;
const _isComputed = isComputed;
const _BRAND = BRAND;

describe('Type Guards: isAtom / isComputed', () => {
  const someAtom = atom(0);
  const computedInstance = computed(() => someAtom.value);
  const effectMock = { [_BRAND]: BrandFlags.Effect };
  // Mix of valid and invalid targets to avoid mono-morphic optimization
  const targets = [someAtom, computedInstance, effectMock, 0, 'str', null, {}, []];

  const guardCases = [
    {
      name: 'baseline: basic property check',
      check: (target: any) =>
        target !== null &&
        (typeof target === 'object' || typeof target === 'function') &&
        target[_BRAND] !== undefined,
    },
    { name: 'isAtom checks', check: _isAtom },
    { name: 'isComputed checks', check: _isComputed },
  ];

  test('guard checks comparison', async ({ bench }) => {
    await bench.compare(
      ...guardCases.map(({ name, check }) =>
        bench(`${name} (x${repeats * targets.length})`, () => {
          for (let i = 0; i < repeats; i++) {
            for (const target of targets) _keep(check(target));
          }
        })
      ),
      microBenchOptions
    );
  });
});
