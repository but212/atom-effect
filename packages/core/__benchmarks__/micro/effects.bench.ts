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
    `baseline: listener registration and removal (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const listeners = new Set<() => void>();
        const listener = () => {};
        listeners.add(listener);
        listeners.delete(listener);
      }
    },
    microBenchOptions
  );

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

  const rawComp = () => rawTrigger.value * 2;
  const rawTrigger = {
    _value: 0,
    get value() {
      return this._value;
    },
    set value(v) {
      this._value = v;
      for (const listener of rawListeners) listener();
    },
  };
  const rawListeners: (() => void)[] = [];
  let rawVal = 0;
  rawListeners.push(() => {
    rawVal = rawComp();
  });

  const trigger = atom(0);
  const comp = computed(() => trigger.value * 2);
  let _val = 0;
  let activeEffect: any;

  bench(
    `baseline: raw callback propagation (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        rawTrigger.value++;
      }
      keep(rawVal);
    },
    microBenchOptions
  );

  bench(
    `propagation: atom → computed → effect (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        trigger.value++;
      }
      keep(_val);
    },
    {
      ...microBenchOptions,
      setup: () => {
        activeEffect = effect(() => {
          _val = comp.value;
        }, benchEffectOptions);
      },
      teardown: () => {
        activeEffect.dispose();
      },
    }
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
  const callbackSet = new Set<() => void>();

  const subCases = [
    {
      name: 'baseline: Set add + delete',
      run: () => {
        const cb = () => {};
        callbackSet.add(cb);
        callbackSet.delete(cb);
      },
    },
    {
      name: 'atom.subscribe + unsubscribe',
      run: () => {
        const unsub = a.subscribe(() => {});
        unsub();
      },
    },
    {
      name: 'computed.subscribe + unsubscribe',
      run: () => {
        const unsub = c.subscribe(() => {});
        unsub();
      },
    },
  ];

  for (const { name, run } of subCases) {
    bench(
      `${name} (x${REPEATS})`,
      () => {
        for (let i = 0; i < REPEATS; i++) run();
      },
      microBenchOptions
    );
  }
});
