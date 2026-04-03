/**
 * @fileoverview Atom micro-benchmarks
 * @description Benchmarks for basic atom operations
 */

import { bench, describe } from 'vitest';
import { atom, untracked } from '../../dist';
import { microBenchOptions } from '../utils/setup.js';

const REPEATS = 100;

describe(`Atom Creation (x${REPEATS})`, () => {
  bench(
    `create primitive atoms (X${REPEATS})`,
    () => {
      let a;
      for (let i = 0; i < REPEATS; i++) {
        a = atom(i);
      }
      return a as any;
    },
    microBenchOptions
  );

  bench(
    `create object atoms (X${REPEATS})`,
    () => {
      let a;
      for (let i = 0; i < REPEATS; i++) {
        a = atom({ count: i });
      }
      return a as any;
    },
    microBenchOptions
  );
});

describe(`Atom Read Operations (x${REPEATS})`, () => {
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));

  bench(
    `read atoms value (X${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) {
        sum += atoms[i]!.value;
      }
      return sum as any;
    },
    microBenchOptions
  );

  bench(
    `read atoms peek (X${REPEATS})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) {
        sum += atoms[i]!.peek();
      }
      return sum as any;
    },
    microBenchOptions
  );
});

describe(`Atom Write Operations (x${REPEATS})`, () => {
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));

  bench(
    `write atoms value (X${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        atoms[i]!.value = i;
      }
    },
    microBenchOptions
  );
});

describe(`Atom Subscription (x${REPEATS})`, () => {
  const a = atom(0);

  bench(
    `subscribe and unsubscribe (X${REPEATS})`,
    () => {
      for (let i = 0; i < 100; i++) {
        const unsubscribe = a.subscribe(() => {});
        unsubscribe();
      }
    },
    microBenchOptions
  );

  const aForNotify = atom(0);
  aForNotify.subscribe(() => {});

  bench(
    'notify 1 subscriber 1000 times',
    () => {
      for (let i = 0; i < 1000; i++) {
        aForNotify.value = i;
      }
    },
    microBenchOptions
  );
});

describe(`Atom Untracked Operations (x${REPEATS})`, () => {
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));

  bench(
    `untracked(fn) read atoms (X${REPEATS})`,
    () => {
      return untracked(() => {
        let sum = 0;
        for (let i = 0; i < REPEATS; i++) {
          sum += atoms[i]!.value;
        }
        return sum as any;
      });
    },
    microBenchOptions
  );
});
