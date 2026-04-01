/**
 * @fileoverview Atom micro-benchmarks
 * @description Benchmarks for basic atom operations
 */

import { bench, describe } from 'vitest';
import { atom, untracked } from '../../dist';
import { microBenchOptions } from '../utils/setup.js';

const REPEAT = 100;

describe(`Atom Creation (x${REPEAT})`, () => {
  bench(
    `create primitive atoms (X${REPEAT})`,
    () => {
      let a;
      for (let i = 0; i < REPEAT; i++) {
        a = atom(i);
      }
      return a as any;
    },
    microBenchOptions
  );

  bench(
    `create object atoms (X${REPEAT})`,
    () => {
      let a;
      for (let i = 0; i < REPEAT; i++) {
        a = atom({ count: i });
      }
      return a as any;
    },
    microBenchOptions
  );
});

describe(`Atom Read Operations (x${REPEAT})`, () => {
  const atoms = Array.from({ length: REPEAT }, (_, i) => atom(i));

  bench(
    `read atoms value (X${REPEAT})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEAT; i++) {
        sum += atoms[i]!.value;
      }
      return sum as any;
    },
    microBenchOptions
  );

  bench(
    `read atoms peek (X${REPEAT})`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEAT; i++) {
        sum += atoms[i]!.peek();
      }
      return sum as any;
    },
    microBenchOptions
  );
});

describe(`Atom Write Operations (x${REPEAT})`, () => {
  const atoms = Array.from({ length: REPEAT }, (_, i) => atom(i));

  bench(
    `write atoms value (X${REPEAT})`,
    () => {
      for (let i = 0; i < REPEAT; i++) {
        atoms[i]!.value = i;
      }
    },
    microBenchOptions
  );
});

describe(`Atom Subscription (x${REPEAT})`, () => {
  const a = atom(0);

  bench(
    `subscribe and unsubscribe (X${REPEAT})`,
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

describe(`Atom Untracked Operations (x${REPEAT})`, () => {
  const atoms = Array.from({ length: REPEAT }, (_, i) => atom(i));

  bench(
    `untracked(fn) read atoms (X${REPEAT})`,
    () => {
      return untracked(() => {
        let sum = 0;
        for (let i = 0; i < REPEAT; i++) {
          sum += atoms[i]!.value;
        }
        return sum as any;
      });
    },
    microBenchOptions
  );
});
