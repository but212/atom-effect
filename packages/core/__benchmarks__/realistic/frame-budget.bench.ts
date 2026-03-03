import { bench, describe } from 'vitest';
import { atom, batch, computed, effect } from '@/index';
import { benchEffectOptions } from '../utils/setup.js';

describe('Frame Budget (16ms)', () => {
  // Setup 100 atoms and a computed that depends on all of them
  const atoms = Array.from({ length: 100 }, () => atom(0));
  const heavyComputed = computed(() => atoms.reduce((s, a) => s + a.value, 0));

  // Effect to force read
  effect(() => {
    void heavyComputed.value;
  }, benchEffectOptions);

  bench('updates per frame (100 atoms)', () => {
    // Perform 100 updates. In a non-batched system, this might trigger 100 re-evals (or at least 100 propagations).
    // In optimized systems, it should be faster.
    for (let i = 0; i < 100; i++) {
      atoms[i]!.value++;
    }
    // Read final value to ensure propagation
    void heavyComputed.value;
  });

  bench('updates per frame (100 atoms, batched)', () => {
    batch(() => {
      for (let i = 0; i < 100; i++) {
        atoms[i]!.value++;
      }
    });
    void heavyComputed.value;
  });
});
