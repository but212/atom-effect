/**
 * @fileoverview Micro-benchmarks for atom-effect core Effect API
 * @description Standardized performance metrics for effects creation, propagation, cleanups, and subscriptions.
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Effects: Life-cycle & Propagation', () => {
  const lifecycleAtom = atom(0);
  const lifecycleFn = () => keep(lifecycleAtom.value);

  bench(
    `creation & disposal (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const e = effect(lifecycleFn, benchEffectOptions);
        e.dispose();
      }
    },
    microBenchOptions
  );

  const trigger = atom(0);
  const comp = computed(() => trigger.value * 2);
  let _val = 0;
  effect(() => {
    _val = comp.value;
  }, benchEffectOptions);

  bench(
    `propagation: atom → computed → effect (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        trigger.value++;
      }
      keep(_val);
    },
    microBenchOptions
  );

  bench(
    `cleanup execution (x${REPEATS})`,
    () => {
      let cleaned = 0;
      const a = atom(0);
      const e = effect(() => {
        keep(a.value);
        return () => {
          cleaned++;
        };
      }, benchEffectOptions);

      for (let i = 0; i < REPEATS; i++) a.value++;
      e.dispose();
      keep(cleaned);
    },
    microBenchOptions
  );
});

describe('Subscribe / Unsubscribe Hotpath', () => {
  const a = atom(0);
  const c = computed(() => a.value * 2);

  bench(
    `atom.subscribe + unsubscribe (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const unsub = a.subscribe(() => {});
        unsub();
      }
    },
    microBenchOptions
  );

  bench(
    `computed.subscribe + unsubscribe (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const unsub = c.subscribe(() => {});
        unsub();
      }
    },
    microBenchOptions
  );
});
