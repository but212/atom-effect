/**
 * @fileoverview Micro-benchmarks for atom-effect propagation under extreme stress
 * @description Standardized performance metrics for deep computed chains and large fan-out/fan-in configurations.
 */

import { bench, describe } from 'vitest';
import { atom, computed } from '../../dist';
import { keep, microBenchOptions } from '../utils/setup.js';

describe('Stress Tests: Extreme Scale (1000)', () => {
  // 1 to 1 (Depth 1000)
  const depthSource = atom(0);
  let depthTarget = computed(() => depthSource.value);
  for (let i = 0; i < 1000; i++) {
    const prev = depthTarget;
    depthTarget = computed(() => prev.value + 1);
  }
  keep(depthTarget.value); // Initial computation

  bench(
    '1 to 1 propagation (Depth 1000)',
    () => {
      depthSource.value++;
      keep(depthTarget.value);
    },
    microBenchOptions
  );

  // 1 to N (Fan Out 1000)
  const fanOut1000Source = atom(0);
  const fanOut1000Targets = Array.from({ length: 1000 }, () =>
    computed(() => fanOut1000Source.value)
  );
  for (const target of fanOut1000Targets) keep(target.value); // Initial computation

  bench(
    '1 to N propagation (Fan Out 1000)',
    () => {
      fanOut1000Source.value++;
      for (const target of fanOut1000Targets) {
        keep(target.value);
      }
    },
    microBenchOptions
  );

  // N to 1 (Fan In 1000)
  const fanIn1000Sources = Array.from({ length: 1000 }, (_, i) => atom(i));
  const fanIn1000Target = computed(() => fanIn1000Sources.reduce((sum, s) => sum + s.value, 0));
  keep(fanIn1000Target.value); // Initial computation

  bench(
    'N to 1 propagation (Fan In 1000)',
    () => {
      const firstSource = fanIn1000Sources[0];
      if (firstSource) firstSource.value++;
      keep(fanIn1000Target.value);
    },
    microBenchOptions
  );
});
