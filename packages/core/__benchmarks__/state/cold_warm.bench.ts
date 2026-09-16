/**
 * @fileoverview Cold-start vs Steady-state benchmarks
 * @description Separates first-run overhead from JIT-warm cached performance.
 * coldBenchOptions sets warmupIterations: 0 to capture genuine cold cost.
 * Vanilla baselines are included for each axis.
 */

import { describe, test } from 'vitest';
import { atom, computed, effect } from '../../dist';
import {
  benchEffectOptions,
  coldBenchOptions,
  keep,
  microBenchOptions,
  REPEATS,
} from '../utils/setup.js';

const repeats = REPEATS;
const _keep = keep;
const _atom = atom;
const _computed = computed;
const _effect = effect;
const _benchEffectOptions = benchEffectOptions;

describe('Cold Start: First Evaluation', () => {
  test('cold start evaluation comparison', async ({ bench }) => {
    await bench.compare(
      bench(`[Vanilla] object allocation (baseline) (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep({ value: Math.random() });
        }
      }),
      bench(`[Atom] creation + first .value read (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const someAtom = _atom(Math.random());
          _keep(someAtom.value);
        }
      }),
      bench(`[Vanilla] function call (computed baseline) (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const randomValue = Math.random();
          _keep(((value: number) => value * 2)(randomValue));
        }
      }),
      bench(`[Atom] lazy computed creation + first eval (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const someAtom = _atom(Math.random());
          const computedInstance = _computed(() => someAtom.value * 2, { lazy: true });
          _keep(computedInstance.value);
        }
      }),
      bench(`[Atom] eager computed creation + first eval (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const someAtom = _atom(Math.random());
          const computedInstance = _computed(() => someAtom.value * 2);
          _keep(computedInstance.value);
        }
      }),
      bench(`[Atom] effect creation + first run + dispose (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const someAtom = _atom(Math.random());
          const effectInstance = _effect(() => _keep(someAtom.value), _benchEffectOptions);
          effectInstance.dispose();
        }
      }),
      coldBenchOptions
    );
  });
});

describe('Steady State: Repeated Operations', () => {
  test('steady state comparison', async ({ bench }) => {
    const warmAtom = _atom(0);
    const warmComputed = _computed(() => warmAtom.value * 2);
    let warmSink = 0;
    const effectInstance = _effect(() => {
      warmSink = warmComputed.value;
    }, _benchEffectOptions);

    try {
      await bench.compare(
        bench(`[Vanilla] variable write + read (x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) {
            let x = 0;
            x = Math.random() * 2;
            _keep(x);
          }
        }),
        bench(`[Atom] atom write + computed propagation (x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) {
            warmAtom.value = Math.random();
            _keep(warmComputed.value);
            _keep(warmSink);
          }
        }),
        bench(`[Atom] atom read only — warm cache (x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) {
            _keep(warmAtom.value);
          }
        }),
        bench(`[Atom] computed read only — warm cache hit (x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) {
            _keep(warmComputed.value);
          }
        }),
        microBenchOptions
      );
    } finally {
      effectInstance.dispose();
    }
  });
});

describe('Cold vs Warm: Computed Cache', () => {
  test('cold computed cache', async ({ bench }) => {
    await bench(`[Cold] new computed each iteration (x${repeats})`, () => {
      for (let i = 0; i < repeats; i++) {
        const source = _atom(0);
        const computedInstance = _computed(() => source.value * 3);
        _keep(computedInstance.value);
      }
    }).run(coldBenchOptions);
  });

  test('warm computed cache comparison', async ({ bench }) => {
    const sharedSource = _atom(0);
    const cachedComputed = _computed(() => sharedSource.value * 3);

    const missSource = _atom(0);
    const missComputed = _computed(() => missSource.value * 3);
    const unsubMiss = missComputed.subscribe(() => {}); // activate

    try {
      await bench.compare(
        bench(`[Warm] reuse computed — cache hit (source unchanged) (x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) {
            _keep(cachedComputed.value);
          }
        }),
        bench(`[Warm] reuse computed — cache miss (source changed) (x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) {
            missSource.value = missSource.peek() === 0 ? 1 : 0;
            _keep(missComputed.value);
          }
        }),
        microBenchOptions
      );
    } finally {
      unsubMiss();
    }
  });
});

describe('Cold vs Warm: Effect Subscription', () => {
  test('cold effect subscription', async ({ bench }) => {
    const source = _atom(0);
    await bench(`[Cold] effect create + first run + dispose (x${repeats})`, () => {
      for (let i = 0; i < repeats; i++) {
        const effectInstance = _effect(() => _keep(source.value), _benchEffectOptions);
        effectInstance.dispose();
      }
    }).run(coldBenchOptions);
  });

  test('warm effect repeated trigger', async ({ bench }) => {
    const source = _atom(0);
    const warmEffect = _effect(() => _keep(source.value), _benchEffectOptions);
    _keep(warmEffect); // prevent DCE

    try {
      await bench('[Warm] effect repeated trigger (x100)', () => {
        for (let i = 0; i < 100; i++) source.value = i;
      }).run(microBenchOptions);
    } finally {
      warmEffect.dispose();
    }
  });
});
