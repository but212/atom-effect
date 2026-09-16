/**
 * @fileoverview Micro-benchmarks for atom-effect propagation under extreme stress
 * @description Standardized performance metrics for deep computed chains and large fan-out/fan-in configurations.
 */

import { describe, test } from 'vitest';
import { atom, computed } from '../../dist';
import { keep, microBenchOptions } from '../utils/setup.js';

const _keep = keep;

describe('Stress Tests: Extreme Scale (1000)', () => {
  test('extreme scale propagation comparison', async ({ bench }) => {
    // 1 to 1 (Depth 1000)
    const depthSource = atom(0);
    let depthTarget = computed(() => depthSource.value);
    for (let i = 0; i < 1000; i++) {
      const previousComputed = depthTarget;
      depthTarget = computed(() => previousComputed.value + 1);
    }
    _keep(depthTarget.value); // Initial computation

    // 1 to N (Fan Out 1000)
    const fanOut1000Source = atom(0);
    const fanOut1000Targets = Array.from({ length: 1000 }, () =>
      computed(() => fanOut1000Source.value)
    );
    for (const target of fanOut1000Targets) _keep(target.value); // Initial computation

    // N to 1 (Fan In 1000)
    const fanIn1000Sources = Array.from({ length: 1000 }, (_, index) => atom(index));
    const fanIn1000Target = computed(() =>
      fanIn1000Sources.reduce((sum, sourceAtom) => sum + sourceAtom.value, 0)
    );
    _keep(fanIn1000Target.value); // Initial computation
    const firstSource = fanIn1000Sources[0] ?? atom(0);

    await bench.compare(
      bench('1 to 1 propagation (Depth 1000)', () => {
        depthSource.value++;
        _keep(depthTarget.value);
      }),
      bench('1 to N propagation (Fan Out 1000)', () => {
        fanOut1000Source.value++;
        for (const target of fanOut1000Targets) {
          _keep(target.value);
        }
      }),
      bench('N to 1 propagation (Fan In 1000)', () => {
        firstSource.value++;
        _keep(fanIn1000Target.value);
      }),
      microBenchOptions
    );
  });
});
