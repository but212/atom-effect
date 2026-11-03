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

    // Dynamic Diamond (1 → 100 → 100 → 1)
    const diamondSource = atom(0);
    const diamondMidA = Array.from({ length: 100 }, (_, i) =>
      computed(() => diamondSource.value + i)
    );
    const diamondMidB = diamondMidA.map((prev, i) =>
      computed(() => prev.value * (i % 2 === 0 ? 2 : 3))
    );
    const diamondSink = computed(() => diamondMidB.reduce((sum, node) => sum + node.value, 0));
    _keep(diamondSink.value);

    // Dynamic Re-wiring (Conditional dynamic branch switching under load)
    const toggle = atom(true);
    const branchASources = Array.from({ length: 50 }, (_, i) => atom(i));
    const branchBSources = Array.from({ length: 50 }, (_, i) => atom(i * 2));
    const branchA = computed(() => branchASources.reduce((sum, a) => sum + a.value, 0));
    const branchB = computed(() => branchBSources.reduce((sum, b) => sum + b.value, 0));
    const dynamicConsumer = computed(() => (toggle.value ? branchA.value : branchB.value));
    _keep(dynamicConsumer.value);

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
      bench('Dynamic Diamond (1 → 100 → 100 → 1)', () => {
        diamondSource.value++;
        _keep(diamondSink.value);
      }),
      bench('Dynamic Re-wiring (Branch switch + leaf update)', () => {
        toggle.value = !toggle.value;
        if (toggle.value) {
          const target = branchASources[0];
          if (target) target.value++;
        } else {
          const target = branchBSources[0];
          if (target) target.value++;
        }
        _keep(dynamicConsumer.value);
      }),
      microBenchOptions
    );
  });
});
