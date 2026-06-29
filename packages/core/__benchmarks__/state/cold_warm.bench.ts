/**
 * @fileoverview Cold-start vs Steady-state benchmarks
 * @description Separates first-run overhead from JIT-warm cached performance.
 * coldBenchOptions sets warmupIterations: 0 to capture genuine cold cost.
 * Vanilla baselines are included for each axis.
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../dist';
import {
  benchEffectOptions,
  coldBenchOptions,
  keep,
  microBenchOptions,
  REPEATS,
} from '../utils/setup.js';

describe('Cold Start: First Evaluation', () => {
  bench(
    `[Vanilla] object allocation (baseline) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        keep({ value: Math.random() });
      }
    },
    coldBenchOptions
  );

  bench(
    `[Atom] creation + first .value read (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const someAtom = atom(Math.random());
        keep(someAtom.value);
      }
    },
    coldBenchOptions
  );

  bench(
    `[Vanilla] function call (computed baseline) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const randomValue = Math.random();
        keep(((value: number) => value * 2)(randomValue));
      }
    },
    coldBenchOptions
  );

  bench(
    `[Atom] lazy computed creation + first eval (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const someAtom = atom(Math.random());
        const computedInstance = computed(() => someAtom.value * 2, { lazy: true });
        keep(computedInstance.value);
      }
    },
    coldBenchOptions
  );

  bench(
    `[Atom] eager computed creation + first eval (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const someAtom = atom(Math.random());
        const computedInstance = computed(() => someAtom.value * 2);
        keep(computedInstance.value);
      }
    },
    coldBenchOptions
  );

  bench(
    `[Atom] effect creation + first run + dispose (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const someAtom = atom(Math.random());
        const effectInstance = effect(() => keep(someAtom.value), benchEffectOptions);
        effectInstance.dispose();
      }
    },
    coldBenchOptions
  );
});

describe('Steady State: Repeated Operations', () => {
  const warmAtom = atom(0);
  const warmComputed = computed(() => warmAtom.value * 2);
  let warmSink = 0;
  effect(() => {
    warmSink = warmComputed.value;
  }, benchEffectOptions);

  bench(
    `[Vanilla] variable write + read (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        let x = 0;
        x = Math.random() * 2;
        keep(x);
      }
    },
    microBenchOptions
  );

  bench(
    `[Atom] atom write + computed propagation (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        warmAtom.value = Math.random();
        keep(warmComputed.value);
        keep(warmSink);
      }
    },
    microBenchOptions
  );

  bench(
    `[Atom] atom read only — warm cache (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(warmAtom.value);
      }
    },
    microBenchOptions
  );

  bench(
    `[Atom] computed read only — warm cache hit (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(warmComputed.value);
      }
    },
    microBenchOptions
  );
});

describe('Cold vs Warm: Computed Cache', () => {
  bench(
    `[Cold] new computed each iteration (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const source = atom(0);
        const computedInstance = computed(() => source.value * 3);
        keep(computedInstance.value);
      }
    },
    coldBenchOptions
  );

  const sharedSource = atom(0);
  const cachedComputed = computed(() => sharedSource.value * 3);

  const missSource = atom(0);
  const missComputed = computed(() => missSource.value * 3);
  missComputed.subscribe(() => {}); // activate

  bench(
    `[Warm] reuse computed — cache hit (source unchanged) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(cachedComputed.value);
      }
    },
    microBenchOptions
  );

  bench(
    `[Warm] reuse computed — cache miss (source changed) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        missSource.value = missSource.peek() === 0 ? 1 : 0;
        keep(missComputed.value);
      }
    },
    microBenchOptions
  );
});

describe('Cold vs Warm: Effect Subscription', () => {
  const source = atom(0);

  bench(
    `[Cold] effect create + first run + dispose (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const effectInstance = effect(() => keep(source.value), benchEffectOptions);
        effectInstance.dispose();
      }
    },
    coldBenchOptions
  );

  const warmEffect = effect(() => keep(source.value), benchEffectOptions);
  keep(warmEffect); // prevent DCE

  bench(
    '[Warm] effect repeated trigger (x100)',
    () => {
      for (let i = 0; i < 100; i++) source.value = i;
    },
    microBenchOptions
  );
});
