/**
 * @fileoverview Micro-benchmarks for atom-effect core Computed API
 * @description Standardized performance metrics for computed creation, caching, and evaluation overhead.
 */

import { describe, test } from 'vitest';
import { atom, computed } from '../../dist';
import { keep, microBenchOptions, REPEATS } from '../utils/setup.js';

const repeats = REPEATS;
const _keep = keep;
const _atom = atom;
const _computed = computed;

describe('Computeds: Reactive Logic', () => {
  test('creation comparison', async ({ bench }) => {
    await bench.compare(
      bench(`baseline: raw function creation (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const aPlain = { value: 0 };
          const bPlain = { value: 1 };
          const cPlain = { value: 2 };
          _keep(() => aPlain.value + bPlain.value + cPlain.value);
        }
      }),
      bench(`creation: flat computed (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const firstAtom = _atom(0);
          const secondAtom = _atom(1);
          const thirdAtom = _atom(2);
          _keep(_computed(() => firstAtom.value + secondAtom.value + thirdAtom.value));
        }
      }),
      bench('creation: chained computed (10 levels)', () => {
        const someAtom = _atom(0);
        let current = _computed(() => someAtom.value);
        for (let i = 0; i < 9; i++) {
          const previousComputed = current;
          current = _computed(() => previousComputed.value + 1);
        }
        _keep(current.value);
      }),
      microBenchOptions
    );
  });

  test('evaluation and caching comparison', async ({ bench }) => {
    const source = _atom(0);
    const chain10 = (() => {
      let curr = _computed(() => source.value);
      for (let i = 0; i < 9; i++) {
        const previousComputed = curr;
        curr = _computed(() => previousComputed.value + 1);
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

    await bench.compare(
      bench(`baseline: raw chained function evaluation (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          rawSource.value++;
          _keep(chain10RawComp());
          _keep(chain10RawComp());
        }
      }),
      bench(`recomputation & cache (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          source.value++;
          _keep(chain10.value); // Recompute
          _keep(chain10.value); // Cache hit
        }
      }),
      bench(`lazy evaluation overhead (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const someAtom = _atom(i);
          const computedInstance = _computed(() => someAtom.value * 2);
          _keep(computedInstance.value);
        }
      }),
      microBenchOptions
    );
  });
});

describe('Computeds: Read Methods (.value vs .peek())', () => {
  test('read methods comparison', async ({ bench }) => {
    const someAtom = _atom(42);
    const computedInstance = _computed(() => someAtom.value + 1);
    let unsubscribeCallback: () => void;
    const rawFn = () => 43;

    const readCases = [
      { name: 'baseline: plain function call', read: () => rawFn() },
      { name: 'computed.value read (active)', read: () => computedInstance.value },
      { name: 'computed.peek() read (active)', read: () => computedInstance.peek() },
    ];

    await bench.compare(
      ...readCases.map(({ name, read }) =>
        bench(
          `${name} (x${repeats})`,
          {
            beforeAll: () => {
              unsubscribeCallback = computedInstance.subscribe(() => {});
            },
            afterAll: () => {
              unsubscribeCallback();
            },
          },
          () => {
            let sum = 0;
            for (let i = 0; i < repeats; i++) sum += read();
            _keep(sum);
          }
        )
      ),
      microBenchOptions
    );
  });
});

describe('Computeds: Asynchronous Flows', () => {
  test('asynchronous flow comparison', async ({ bench }) => {
    let resolvedAsync: any;
    let resolvedUnsub: () => void;
    let asyncUnsub: () => void;

    await bench.compare(
      bench(`creation: async computed (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const computedInstance = _computed(async () => 42, { defaultValue: 0 });
          _keep(computedInstance);
          computedInstance.dispose();
        }
      }),
      bench(
        `read: resolved value & state (x${repeats})`,
        {
          beforeAll: () => {
            resolvedAsync = _computed(async () => 42, { defaultValue: 0 });
            resolvedUnsub = resolvedAsync.subscribe(() => {});
            resolvedAsync.value; // trigger evaluation
          },
          afterAll: () => {
            resolvedUnsub();
            resolvedAsync.dispose();
          },
        },
        () => {
          for (let i = 0; i < repeats; i++) {
            _keep(resolvedAsync.value);
            _keep(resolvedAsync.state);
          }
        }
      ),
      bench('resolution: promise resolving lifecycle', async () => {
        let resolve!: (value: number) => void;
        const promise = new Promise<number>((r) => {
          resolve = r;
        });
        const computedInstance = _computed(() => promise, { defaultValue: 0 });
        asyncUnsub = computedInstance.subscribe(() => {});

        try {
          _keep(computedInstance.value); // trigger calculation, transitions to pending
          resolve(42);

          await promise; // wait for promise to settle
          await Promise.resolve(); // wait for computed microtask to resolve
          _keep(computedInstance.value); // read resolved value
        } finally {
          asyncUnsub();
          computedInstance.dispose();
        }
      }),
      microBenchOptions
    );
  });
});
