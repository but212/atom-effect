import { bench, describe } from 'vitest';
import { atom, computed } from '../../src/index.js';

// Setup for propagation benchmarks (Depth)
const depthSource = atom(0);
let depthTarget = computed(() => depthSource.value);
for (let i = 0; i < 1000; i++) {
  const prev = depthTarget;
  depthTarget = computed(() => prev.value + 1);
}

// Setup for propagation benchmarks (Fan Out)
const fanOutSource = atom(0);
const fanOutTargets = Array.from({ length: 1000 }, () => computed(() => fanOutSource.value));

// Setup for propagation benchmarks (Fan In)
const fanInSources = Array.from({ length: 1000 }, (_, i) => atom(i));
const fanInTarget = computed(() => fanInSources.reduce((sum, s) => sum + s.value, 0));

describe('Propagation Performance', () => {
  bench('1 to 1 (Depth 1000)', () => {
    depthSource.value++;
    depthTarget.value;
  });

  bench('1 to N (Fan Out 1000)', () => {
    fanOutSource.value++;
    for (let i = 0; i < 1000; i++) {
      fanOutTargets[i].value;
    }
  });

  bench('N to 1 (Fan In 1000)', () => {
    // Modify one source
    fanInSources[0].value++;
    fanInTarget.value;
  });
});
