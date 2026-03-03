/**
 * @fileoverview Atom micro-benchmarks
 * @description Benchmarks for basic atom operations
 */

import { bench, describe } from 'vitest';
import { atom, untracked } from '@/index';
import { microBenchOptions } from '../utils/setup.js';

describe('Atom Creation (x1000)', () => {
  bench(
    'create 1000 atoms (primitives)',
    () => {
      for (let i = 0; i < 1000; i++) {
        const a = atom(i);
        void a;
      }
    },
    microBenchOptions
  );

  bench(
    'create 1000 atoms (objects)',
    () => {
      for (let i = 0; i < 1000; i++) {
        const a = atom({ count: i });
        void a;
      }
    },
    microBenchOptions
  );
});

describe('Atom Read Operations (x1000)', () => {
  const atoms = Array.from({ length: 1000 }, (_, i) => atom(i));

  bench(
    'read 1000 atoms value',
    () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += atoms[i].value;
      }
      void sum;
    },
    microBenchOptions
  );

  bench(
    'read 1000 atoms peek()',
    () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += atoms[i].peek();
      }
      void sum;
    },
    microBenchOptions
  );
});

describe('Atom Write Operations (x1000)', () => {
  const atoms = Array.from({ length: 1000 }, (_, i) => atom(i));

  bench(
    'write 1000 atoms value',
    () => {
      for (let i = 0; i < 1000; i++) {
        atoms[i].value = i;
      }
    },
    microBenchOptions
  );
});

describe('Atom Subscription (x100)', () => {
  const a = atom(0);

  bench(
    'subscribe and unsubscribe 100 times',
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

describe('Atom Untracked Operations (x1000)', () => {
  const atoms = Array.from({ length: 1000 }, (_, i) => atom(i));

  bench(
    'untracked(fn) read 1000 atoms',
    () => {
      untracked(() => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += atoms[i].value;
        }
        void sum;
      });
    },
    microBenchOptions
  );
});
