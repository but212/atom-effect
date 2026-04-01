import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../dist';
import { benchEffectOptions, forceGC, memoryBenchOptions } from '../utils/setup';

const REPEATS = 100;

describe('Memory Stability', () => {
  bench(
    `heavy component churn (x${REPEATS})`,
    () => {
      const createComponent = (id: number) => {
        const state = atom({ id, data: 'some data' });
        const derived = computed(() => `ID: ${state.value.id} - ${state.value.data.toUpperCase()}`);
        let _val;
        const stop = effect(() => {
          _val = derived.value;
        }, benchEffectOptions);
        return { state, derived, stop };
      };

      const components: ReturnType<typeof createComponent>[] = [];

      // Mount 1000 components
      for (let i = 0; i < REPEATS; i++) {
        components.push(createComponent(i));
      }

      // Update them
      for (let i = 0; i < REPEATS; i++) {
        components[i]!.state.value = { id: i, data: 'updated data' };
      }

      // Unmount them
      for (let i = 0; i < REPEATS; i++) {
        components[i]!.stop.dispose();
      }

      // Force GC to allow cleanup observation if --expose-gc is enabled
      forceGC();
      return components as any;
    },
    memoryBenchOptions
  );
});
