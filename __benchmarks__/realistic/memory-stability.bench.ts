import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../src/index.js';

describe('Memory Stability', () => {
  bench('memory usage after component churn', () => {
    // Simulate creating and destroying components
    const createComponent = () => {
      const state = atom({ data: 'some data' });
      const derived = computed(() => state.value.data.toUpperCase());
      const stop = effect(() => {
        const _ = derived.value;
      });
      return { state, derived, stop };
    };

    const components: any[] = [];

    // Mount 50 components
    for (let i = 0; i < 50; i++) {
      components.push(createComponent());
    }

    // Update them
    for (const comp of components) {
      comp.state.value = { data: 'updated data' };
    }

    // Unmount them
    for (const comp of components) {
      comp.stop();
    }

    // Note: We can't easily measure memory usage *inside* the benchmark loop
    // reliably for the result, but the execution time will reflect overhead
    // of creation/destruction/cleanup.
    // Actual memory usage snapshots are better done outside of micro-benchmarking loops.
    // But this tests the performance of the lifecycle.
  });
});
