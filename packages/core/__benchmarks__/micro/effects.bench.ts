/**
 * @fileoverview Micro-benchmarks for atom-effect core Effect API
 * @description Standardized performance metrics for effects creation, propagation, cleanups, and subscriptions.
 */

import { describe, test } from 'vitest';
import { atom, computed, effect } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Effects: Life-cycle & Propagation', () => {
  test('lifecycle comparison', async ({ bench }) => {
    const lifecycleAtom = atom(0);
    const lifecycleFn = () => keep(lifecycleAtom.value);

    await bench.compare(
      bench(`baseline: listener registration and removal (x${REPEATS})`, () => {
        for (let i = 0; i < REPEATS; i++) {
          const listeners = new Set<() => void>();
          const listener = () => {};
          listeners.add(listener);
          listeners.delete(listener);
        }
      }),
      bench(`creation & disposal (x${REPEATS})`, () => {
        for (let i = 0; i < REPEATS; i++) {
          const effectInstance = effect(lifecycleFn, benchEffectOptions);
          effectInstance.dispose();
        }
      }),
      microBenchOptions
    );
  });

  test('propagation and cleanups comparison', async ({ bench }) => {
    const rawListeners: (() => void)[] = [];
    const rawTrigger = {
      _value: 0,
      get value() {
        return this._value;
      },
      set value(value) {
        this._value = value;
        for (const listener of rawListeners) listener();
      },
    };
    const rawComp = () => rawTrigger.value * 2;
    let rawVal = 0;
    rawListeners.push(() => {
      rawVal = rawComp();
    });

    const trigger = atom(0);
    const comp = computed(() => trigger.value * 2);
    let executionValue = 0;
    let activeEffect: any;

    await bench.compare(
      bench(`baseline: raw callback propagation (x${REPEATS})`, () => {
        for (let i = 0; i < REPEATS; i++) {
          rawTrigger.value++;
        }
        keep(rawVal);
      }),
      bench(
        `propagation: atom → computed → effect (x${REPEATS})`,
        {
          beforeAll: () => {
            activeEffect = effect(() => {
              executionValue = comp.value;
            }, benchEffectOptions);
          },
          afterAll: () => {
            activeEffect.dispose();
          },
        },
        () => {
          for (let i = 0; i < REPEATS; i++) {
            trigger.value++;
          }
          keep(executionValue);
        }
      ),
      bench(`cleanup execution (x${REPEATS})`, () => {
        let cleaned = 0;
        const someAtom = atom(0);
        const effectInstance = effect(() => {
          keep(someAtom.value);
          return () => {
            cleaned++;
          };
        }, benchEffectOptions);

        for (let i = 0; i < REPEATS; i++) someAtom.value++;
        effectInstance.dispose();
        keep(cleaned);
      }),
      microBenchOptions
    );
  });
});

describe('Subscribe / Unsubscribe Hotpath', () => {
  test('subscribe and unsubscribe comparison', async ({ bench }) => {
    const someAtom = atom(0);
    const computedInstance = computed(() => someAtom.value * 2);
    const callbackSet = new Set<() => void>();

    const subCases = [
      {
        name: 'baseline: Set add + delete',
        run: () => {
          const callback = () => {};
          callbackSet.add(callback);
          callbackSet.delete(callback);
        },
      },
      {
        name: 'atom.subscribe + unsubscribe',
        run: () => {
          const unsubscribeCallback = someAtom.subscribe(() => {});
          unsubscribeCallback();
        },
      },
      {
        name: 'computed.subscribe + unsubscribe',
        run: () => {
          const unsubscribeCallback = computedInstance.subscribe(() => {});
          unsubscribeCallback();
        },
      },
    ];

    await bench.compare(
      ...subCases.map(({ name, run }) =>
        bench(`${name} (x${REPEATS})`, () => {
          for (let i = 0; i < REPEATS; i++) run();
        })
      ),
      microBenchOptions
    );
  });
});
