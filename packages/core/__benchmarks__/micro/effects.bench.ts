/**
 * @fileoverview Micro-benchmarks for atom-effect core Effect API
 * @description Standardized performance metrics for effects creation, propagation, cleanups, and subscriptions.
 */

import { describe, test } from 'vitest';
import { atom, computed, effect } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

const repeats = REPEATS;
const _keep = keep;
const _atom = atom;
const _computed = computed;
const _effect = effect;
const _benchEffectOptions = benchEffectOptions;

describe('Effects: Life-cycle & Propagation', () => {
  test('lifecycle comparison', async ({ bench }) => {
    const lifecycleAtom = _atom(0);
    const lifecycleFn = () => _keep(lifecycleAtom.value);

    await bench.compare(
      bench(`baseline: listener registration and removal (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const listeners = new Set<() => void>();
          const listener = () => {};
          listeners.add(listener);
          listeners.delete(listener);
        }
      }),
      bench(`creation & disposal (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const effectInstance = _effect(lifecycleFn, _benchEffectOptions);
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

    const trigger = _atom(0);
    const comp = _computed(() => trigger.value * 2);
    let executionValue = 0;
    let activeEffect: any;

    await bench.compare(
      bench(`baseline: raw callback propagation (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          rawTrigger.value++;
        }
        _keep(rawVal);
      }),
      bench(
        `propagation: atom → computed → effect (x${repeats})`,
        {
          beforeAll: () => {
            activeEffect = _effect(() => {
              executionValue = comp.value;
            }, _benchEffectOptions);
          },
          afterAll: () => {
            activeEffect.dispose();
          },
        },
        () => {
          for (let i = 0; i < repeats; i++) {
            trigger.value++;
          }
          _keep(executionValue);
        }
      ),
      bench(`cleanup execution (x${repeats})`, () => {
        let cleaned = 0;
        const someAtom = _atom(0);
        const effectInstance = _effect(() => {
          _keep(someAtom.value);
          return () => {
            cleaned++;
          };
        }, _benchEffectOptions);

        for (let i = 0; i < repeats; i++) someAtom.value++;
        effectInstance.dispose();
        _keep(cleaned);
      }),
      microBenchOptions
    );
  });
});

describe('Subscribe / Unsubscribe Hotpath', () => {
  test('subscribe and unsubscribe comparison', async ({ bench }) => {
    const someAtom = _atom(0);
    const computedInstance = _computed(() => someAtom.value * 2);
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
        bench(`${name} (x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) run();
        })
      ),
      microBenchOptions
    );
  });
});
