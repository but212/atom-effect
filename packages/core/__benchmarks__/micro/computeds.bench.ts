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
        const aPlain = { value: 0 };
        const bPlain = { value: 1 };
        const cPlain = { value: 2 };
        keep(() => aPlain.value + bPlain.value + cPlain.value);
      }
    },
    microBenchOptions
  );

  bench(
    `creation: flat computed (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const firstAtom = atom(0);
        const secondAtom = atom(1);
        const thirdAtom = atom(2);
        keep(computed(() => firstAtom.value + secondAtom.value + thirdAtom.value));
      }
    },
    microBenchOptions
  );

  bench(
    'creation: chained computed (10 levels)',
    () => {
      const someAtom = atom(0);
      let current = computed(() => someAtom.value);
      for (let i = 0; i < 9; i++) {
        const previousComputed = current;
        current = computed(() => previousComputed.value + 1);
      }
      keep(current.value);
    },
    microBenchOptions
  );

  const source = atom(0);
  const chain10 = (() => {
    let curr = computed(() => source.value);
    for (let i = 0; i < 9; i++) {
      const previousComputed = curr;
      curr = computed(() => previousComputed.value + 1);
    }
    return curr;
  })();

  const rawSource = { value: 0 };
  const rawComp1 = () => rawSource.value;
  const rawComp2 = () => rawComp1() + 1;
  const rawComp3 = () => rawComp2() + 1;
  const rawComp4 = () => rawComp3() + 1;
  const rawComp5 = () => rawComp4() + 1;
  const rawComp6 = () => rawComp5() + 1;
  const rawComp7 = () => rawComp6() + 1;
  const rawComp8 = () => rawComp7() + 1;
  const rawComp9 = () => rawComp8() + 1;
  const chain10RawComp = () => rawComp9() + 1;

  bench(
    `baseline: raw chained function evaluation (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        rawSource.value++;
        keep(chain10RawComp());
        keep(chain10RawComp());
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
        const someAtom = atom(i);
        const computedInstance = computed(() => someAtom.value * 2);
        keep(computedInstance.value);
      }
    },
    microBenchOptions
  );
});

describe('Computeds: Read Methods (.value vs .peek())', () => {
  const someAtom = atom(42);
  const computedInstance = computed(() => someAtom.value + 1);
  let unsubscribeCallback: () => void;

  const rawFn = () => 43;

  const readCases = [
    { name: 'baseline: plain function call', read: () => rawFn() },
    { name: 'computed.value read (active)', read: () => computedInstance.value },
    { name: 'computed.peek() read (active)', read: () => computedInstance.peek() },
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
          unsubscribeCallback = computedInstance.subscribe(() => {});
        },
        teardown: () => {
          unsubscribeCallback();
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
        const computedInstance = computed(async () => 42, { defaultValue: 0 });
        keep(computedInstance);
        computedInstance.dispose();
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
      let resolve!: (value: number) => void;
      const promise = new Promise<number>((r) => {
        resolve = r;
      });
      const computedInstance = computed(() => promise, { defaultValue: 0 });
      asyncUnsub = computedInstance.subscribe(() => {});

      try {
        keep(computedInstance.value); // trigger calculation, transitions to pending
        resolve(42);

        await promise; // wait for promise to settle
        await Promise.resolve(); // wait for computed microtask to resolve
        keep(computedInstance.value); // read resolved value
      } finally {
        asyncUnsub();
        computedInstance.dispose();
      }
    },
    microBenchOptions
  );
});
