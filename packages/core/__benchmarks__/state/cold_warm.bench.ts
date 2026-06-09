/**
 * @fileoverview Cold-start vs Steady-state benchmarks
 * @description Separates first-run overhead from JIT-warm cached performance.
 * coldBenchOptions sets warmupIterations: 0 to capture genuine cold cost.
 * Vanilla baselines are included for each axis.
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../dist';
import { benchEffectOptions, coldBenchOptions, keep, microBenchOptions } from '../utils/setup.js';

describe('Cold Start: First Evaluation', () => {
  bench(
    '[Vanilla] object allocation (baseline)',
    () => {
      keep({ value: Math.random() });
    },
    coldBenchOptions
  );

  bench(
    '[Atom] creation + first .value read',
    () => {
      const a = atom(Math.random());
      keep(a.value);
    },
    coldBenchOptions
  );

  bench(
    '[Vanilla] function call (computed baseline)',
    () => {
      const x = Math.random();
      keep(((v: number) => v * 2)(x));
    },
    coldBenchOptions
  );

  bench(
    '[Atom] lazy computed creation + first eval',
    () => {
      const a = atom(Math.random());
      const c = computed(() => a.value * 2, { lazy: true });
      keep(c.value);
    },
    coldBenchOptions
  );

  bench(
    '[Atom] eager computed creation + first eval',
    () => {
      const a = atom(Math.random());
      const c = computed(() => a.value * 2);
      keep(c.value);
    },
    coldBenchOptions
  );

  bench(
    '[Atom] effect creation + first run + dispose',
    () => {
      const a = atom(Math.random());
      const e = effect(() => keep(a.value), benchEffectOptions);
      e.dispose();
    },
    coldBenchOptions
  );
});

describe('Steady State: Repeated Operations', () => {
  const warmAtom = atom(0);
  const warmComputed = computed(() => warmAtom.value * 2);
  let _warmSink = 0;
  effect(() => {
    _warmSink = warmComputed.value;
  }, benchEffectOptions);

  bench(
    '[Vanilla] variable write + read',
    () => {
      let x = 0;
      x = Math.random() * 2;
      keep(x);
    },
    microBenchOptions
  );

  bench(
    '[Atom] atom write + computed propagation',
    () => {
      warmAtom.value = Math.random();
      keep(warmComputed.value);
      keep(_warmSink);
    },
    microBenchOptions
  );

  bench(
    '[Atom] atom read only — warm cache',
    () => {
      keep(warmAtom.value);
    },
    microBenchOptions
  );

  bench(
    '[Atom] computed read only — warm cache hit',
    () => {
      keep(warmComputed.value);
    },
    microBenchOptions
  );
});

describe('Cold vs Warm: Computed Cache', () => {
  bench(
    '[Cold] new computed each iteration',
    () => {
      const source = atom(0);
      const c = computed(() => source.value * 3);
      keep(c.value);
    },
    coldBenchOptions
  );

  const sharedSource = atom(0);
  const cachedComputed = computed(() => sharedSource.value * 3);

  const missSource = atom(0);
  const missComputed = computed(() => missSource.value * 3);
  missComputed.subscribe(() => {}); // activate

  bench(
    '[Warm] reuse computed — cache hit (source unchanged)',
    () => {
      keep(cachedComputed.value);
    },
    microBenchOptions
  );

  bench(
    '[Warm] reuse computed — cache miss (source changed)',
    () => {
      missSource.value = missSource.peek() === 0 ? 1 : 0;
      keep(missComputed.value);
    },
    microBenchOptions
  );
});

describe('Cold vs Warm: Effect Subscription', () => {
  const src = atom(0);

  bench(
    '[Cold] effect create + first run + dispose',
    () => {
      const e = effect(() => keep(src.value), benchEffectOptions);
      e.dispose();
    },
    coldBenchOptions
  );

  const warmEffect = effect(() => keep(src.value), benchEffectOptions);
  keep(warmEffect); // prevent DCE

  bench(
    '[Warm] effect repeated trigger (x100)',
    () => {
      for (let i = 0; i < 100; i++) src.value = i;
    },
    microBenchOptions
  );
});
