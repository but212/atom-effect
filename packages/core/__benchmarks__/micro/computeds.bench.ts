/**
 * @fileoverview Micro-benchmarks for atom-effect core Computed API
 * @description Standardized performance metrics for computed creation, caching, and evaluation overhead.
 */

import { bench, describe } from 'vitest';
import { atom, computed } from '../../dist';
import { keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Computeds: Reactive Logic', () => {
  bench(
    `baseline: raw function creation (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const a = { value: 0 };
        const b = { value: 1 };
        const c = { value: 2 };
        keep(() => a.value + b.value + c.value);
      }
    },
    microBenchOptions
  );

  bench(
    `creation: flat computed (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        const b = atom(1);
        const c = atom(2);
        keep(computed(() => a.value + b.value + c.value));
      }
    },
    microBenchOptions
  );

  bench(
    'creation: chained computed (10 levels)',
    () => {
      const a = atom(0);
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

  const rawSource = { value: 0 };
  const c1 = () => rawSource.value;
  const c2 = () => c1() + 1;
  const c3 = () => c2() + 1;
  const c4 = () => c3() + 1;
  const c5 = () => c4() + 1;
  const c6 = () => c5() + 1;
  const c7 = () => c6() + 1;
  const c8 = () => c7() + 1;
  const c9 = () => c8() + 1;
  const chain10Raw = () => c9() + 1;

  bench(
    `baseline: raw chained function evaluation (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        rawSource.value++;
        keep(chain10Raw());
        keep(chain10Raw());
      }
    },
    microBenchOptions
  );

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
        const c = computed(() => a.value * 2);
        keep(c.value);
      }
    },
    microBenchOptions
  );
});

describe('Computeds: Read Methods (.value vs .peek())', () => {
  const a = atom(42);
  const c = computed(() => a.value + 1);
  let unsub: () => void;

  const rawFn = () => 43;

  const readCases = [
    { name: 'baseline: plain function call', read: () => rawFn() },
    { name: 'computed.value read (active)', read: () => c.value },
    { name: 'computed.peek() read (active)', read: () => c.peek() },
  ];

  for (const { name, read } of readCases) {
    bench(
      `${name} (x${REPEATS})`,
      () => {
        let sum = 0;
        for (let i = 0; i < REPEATS; i++) sum += read();
        keep(sum);
      },
      {
        ...microBenchOptions,
        setup: () => {
          unsub = c.subscribe(() => {});
        },
        teardown: () => {
          unsub();
        },
      }
    );
  }
});

describe('Computeds: Asynchronous Flows', () => {
  let resolvedAsync: any;
  let resolvedUnsub: () => void;

  bench(
    `creation: async computed (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const c = computed(async () => 42, { defaultValue: 0 });
        keep(c);
        c.dispose();
      }
    },
    microBenchOptions
  );

  bench(
    `read: resolved value & state (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(resolvedAsync.value);
        keep(resolvedAsync.state);
      }
    },
    {
      ...microBenchOptions,
      setup: () => {
        resolvedAsync = computed(async () => 42, { defaultValue: 0 });
        resolvedUnsub = resolvedAsync.subscribe(() => {});
        resolvedAsync.value; // trigger evaluation
      },
      teardown: () => {
        resolvedUnsub();
        resolvedAsync.dispose();
      },
    }
  );

  let asyncUnsub: () => void;
  bench(
    'resolution: promise resolving lifecycle',
    async () => {
      let resolve!: (v: number) => void;
      const promise = new Promise<number>((r) => {
        resolve = r;
      });
      const c = computed(() => promise, { defaultValue: 0 });
      asyncUnsub = c.subscribe(() => {});

      try {
        keep(c.value); // trigger calculation, transitions to pending
        resolve(42);

        await promise; // wait for promise to settle
        await Promise.resolve(); // wait for computed microtask to resolve
        keep(c.value); // read resolved value
      } finally {
        asyncUnsub();
        c.dispose();
      }
    },
    microBenchOptions
  );
});
