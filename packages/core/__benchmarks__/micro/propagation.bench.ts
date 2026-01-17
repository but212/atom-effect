import { bench, describe } from 'vitest';
import { atom, computed } from '../../src/index.js';

describe('Propagation Performance', () => {
  // 1 to 1 (Depth 1000)
  const depthSource = atom(0);
  let depthTarget = computed(() => depthSource.value);
  for (let i = 0; i < 1000; i++) {
    const prev = depthTarget;
    depthTarget = computed(() => prev.value + 1);
  }
  depthTarget.value; // Initial computation

  bench('1 to 1 (Depth 1000)', () => {
    depthSource.value++;
    depthTarget.value;
  });

  // 1 to N (Fan Out 1000)
  const fanOutSource = atom(0);
  const fanOutTargets = Array.from({ length: 1000 }, () => computed(() => fanOutSource.value));
  for (const target of fanOutTargets) target.value; // Initial computation

  bench('1 to N (Fan Out 1000)', () => {
    fanOutSource.value++;
    for (const target of fanOutTargets) {
      target.value;
    }
  });

  // N to 1 (Fan In 1000)
  const fanInSources = Array.from({ length: 1000 }, (_, i) => atom(i));
  const fanInTarget = computed(() => fanInSources.reduce((sum, s) => sum + s.value, 0));
  fanInTarget.value; // Initial computation

  bench('N to 1 (Fan In 1000)', () => {
    fanInSources[0].value++;
    fanInTarget.value;
  });
});
