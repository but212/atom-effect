/**
 * @fileoverview Consolidated micro-benchmarks for atom-effect core API
 * @description Standardized performance metrics for atoms, computeds, effects, and lenses.
 */

import { bench, describe } from 'vitest';
import {
  atom,
  atomLens,
  batch,
  composeLens,
  computed,
  effect,
  isAtom,
  isComputed,
  untracked,
} from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Atoms: Core Operations', () => {
  bench(
    `creation: primitive atom (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(atom(i));
    },
    microBenchOptions
  );

  bench(
    `creation: object atom (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(atom({ count: i }));
    },
    microBenchOptions
  );

  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
  // Force active subscriptions to bypass 'size === 0' optimization
  atoms.forEach((a) => effect(() => keep(a.value), benchEffectOptions));

  bench(
    `read/write performance: active (x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) {
        atoms[i]!.value++;
        sum += atoms[i]!.value;
      }
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `untracked read: active (x${REPEATS})`,
    () => {
      untracked(() => {
        let sum = 0;
        for (let i = 0; i < REPEATS; i++) sum += atoms[i]!.value;
        keep(sum);
      });
    },
    microBenchOptions
  );
});

describe('Batching & Synchronization', () => {
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
  atoms.forEach((a) => effect(() => keep(a.value), benchEffectOptions));

  bench(
    `batch update 100 atoms: active (x${REPEATS})`,
    () => {
      batch(() => {
        for (let i = 0; i < REPEATS; i++) atoms[i]!.value++;
      });
    },
    microBenchOptions
  );

  const a = atom(0);
  const b = atom(0);
  const sum = computed(() => a.value + b.value);
  const doubled = computed(() => sum.value * 2);

  bench(
    `batched computed chain update (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        batch(() => {
          a.value++;
          b.value++;
        });
        keep(doubled.value);
      }
    },
    microBenchOptions
  );
});

describe('Computeds: Reactive Logic', () => {
  bench(
    `creation: flat vs chain (10 levels)`,
    () => {
      const a = atom(0);
      const b = atom(1);
      const c = atom(2);
      // Flat
      keep(computed(() => a.value + b.value + c.value));
      // Chain
      let current = computed(() => a.value);
      for (let i = 0; i < 9; i++) {
        const prev = current;
        current = computed(() => prev.value + 1);
      }
      keep(current.value);
    },
    microBenchOptions
  );

  const source = atom(0);
  const chain10 = (() => {
    let curr = computed(() => source.value);
    for (let i = 0; i < 9; i++) {
      const prev = curr;
      curr = computed(() => prev.value + 1);
    }
    return curr;
  })();

  bench(
    `recomputation & cache (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        source.value++;
        keep(chain10.value); // Recompute
        keep(chain10.value); // Cache hit
      }
    },
    microBenchOptions
  );

  bench(
    `lazy evaluation overhead (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(i);
        const c = computed(() => a.value * 2, { lazy: true });
        keep(c.value);
      }
    },
    microBenchOptions
  );
});

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

describe('Lenses: Structural Access', () => {
  const source = atom({ a: { b: { c: 1 } } });
  const lens = atomLens(source, 'a.b.c');
  const comp = computed(() => source.value.a.b.c);
  comp.subscribe(() => {});

  bench(
    `read: lens (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(lens.value);
    },
    microBenchOptions
  );

  bench(
    `read: computed active (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(comp.value);
    },
    microBenchOptions
  );

  bench(
    `read: direct object access (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(source.value.a.b.c);
    },
    microBenchOptions
  );

  bench(
    `write: lens (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) lens.value = i;
    },
    microBenchOptions
  );

  bench(
    `write: manual spread (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        source.value = {
          ...source.value,
          a: { ...source.value.a, b: { ...source.value.a.b, c: i } },
        };
      }
    },
    microBenchOptions
  );

  bench(
    `composition & scaling (100 active lenses)`,
    () => {
      const sharedSource = atom({ x: { y: 1 } });
      const composed = composeLens(atomLens(sharedSource, 'x' as any), 'y');
      const manyLenses = Array.from({ length: 100 }, () => {
        const l = atomLens(sharedSource, 'x.y' as any);
        l.subscribe(() => {});
        return l;
      });

      sharedSource.value = { x: { y: 2 } };
      keep([composed.value, manyLenses.length]);
    },
    microBenchOptions
  );
});

describe('Stress Tests: Extreme Scale (1000)', () => {
  // 1 to 1 (Depth 1000)
  const depthSource = atom(0);
  let depthTarget = computed(() => depthSource.value);
  for (let i = 0; i < 1000; i++) {
    const prev = depthTarget;
    depthTarget = computed(() => prev.value + 1);
  }
  keep(depthTarget.value); // Initial computation

  bench(
    '1 to 1 propagation (Depth 1000)',
    () => {
      depthSource.value++;
      keep(depthTarget.value);
    },
    microBenchOptions
  );

  // 1 to N (Fan Out 1000)
  const fanOut1000Source = atom(0);
  const fanOut1000Targets = Array.from({ length: 1000 }, () =>
    computed(() => fanOut1000Source.value)
  );
  for (const target of fanOut1000Targets) keep(target.value); // Initial computation

  bench(
    '1 to N propagation (Fan Out 1000)',
    () => {
      fanOut1000Source.value++;
      for (const target of fanOut1000Targets) {
        keep(target.value);
      }
    },
    microBenchOptions
  );

  // N to 1 (Fan In 1000)
  const fanIn1000Sources = Array.from({ length: 1000 }, (_, i) => atom(i));
  const fanIn1000Target = computed(() => fanIn1000Sources.reduce((sum, s) => sum + s.value, 0));
  keep(fanIn1000Target.value); // Initial computation

  bench(
    'N to 1 propagation (Fan In 1000)',
    () => {
      fanIn1000Sources[0]!.value++;
      keep(fanIn1000Target.value);
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

describe('Read Methods: .value vs .peek()', () => {
  const a = atom(42);
  const c = computed(() => a.value + 1);
  c.subscribe(() => {}); // keep active

  bench(
    `atom.value read (x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) sum += a.value;
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `atom.peek() read (x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) sum += a.peek();
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `computed.value read (active, x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) sum += c.value;
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `computed.peek() read (active, x${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) sum += c.peek();
      keep(sum);
    },
    microBenchOptions
  );
});

describe('Type Guards: isAtom / isComputed', () => {
  const a = atom(0);
  const c = computed(() => a.value);
  const e = effect(() => keep(a.value), benchEffectOptions);
  // Mix of valid and invalid targets to avoid mono-morphic optimization
  const targets = [a, c, e, 0, 'str', null, {}, []];

  bench(
    `isAtom checks (x${REPEATS * targets.length})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        for (const t of targets) keep(isAtom(t));
      }
    },
    microBenchOptions
  );

  bench(
    `isComputed checks (x${REPEATS * targets.length})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        for (const t of targets) keep(isComputed(t));
      }
    },
    microBenchOptions
  );
});
