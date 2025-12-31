/**
 * @fileoverview Atom micro-benchmarks
 * @description Benchmarks for basic atom operations
 */

import { bench, describe } from 'vitest';
import { atom } from '../../src/index.js';
import { microBenchOptions } from '../utils/setup.js';

describe('Atom Creation', () => {
  bench(
    'create atom with primitive value',
    () => {
      const a = atom(0);
      return a;
    },
    microBenchOptions
  );

  bench(
    'create atom with object value',
    () => {
      const a = atom({ count: 0, name: 'test' });
      return a;
    },
    microBenchOptions
  );

  bench(
    'create 100 atoms',
    () => {
      const atoms = Array.from({ length: 100 }, (_, i) => atom(i));
      return atoms;
    },
    microBenchOptions
  );
});

describe('Atom Read Operations', () => {
  bench(
    'read atom.value',
    () => {
      const a = atom(42);
      const _ = a.value;
      return _;
    },
    microBenchOptions
  );

  bench(
    'read atom.peek()',
    () => {
      const a = atom(42);
      return a.peek();
    },
    microBenchOptions
  );

  bench(
    'read 100 atoms sequentially',
    () => {
      const atoms = Array.from({ length: 100 }, (_, i) => atom(i));
      let sum = 0;
      for (const a of atoms) {
        sum += a.value;
      }
      return sum;
    },
    microBenchOptions
  );
});

describe('Atom Write Operations', () => {
  bench(
    'write atom.value (single)',
    () => {
      const a = atom(0);
      a.value = 1;
    },
    microBenchOptions
  );

  bench(
    'write atom.value (10 times)',
    () => {
      const a = atom(0);
      for (let i = 0; i < 10; i++) {
        a.value = i;
      }
    },
    microBenchOptions
  );

  bench(
    'write 100 atoms',
    () => {
      const atoms = Array.from({ length: 100 }, (_, i) => atom(i));
      for (let i = 0; i < atoms.length; i++) {
        atoms[i].value = i * 2;
      }
    },
    microBenchOptions
  );

  bench(
    'write atom with object (shallow)',
    () => {
      const a = atom({ count: 0 });
      a.value = { count: 1 };
    },
    microBenchOptions
  );
});

describe('Atom Subscription', () => {
  bench(
    'subscribe and unsubscribe',
    () => {
      const a = atom(0);
      const unsubscribe = a.subscribe(() => {});
      unsubscribe();
    },
    microBenchOptions
  );

  bench(
    'subscribe with 10 listeners',
    () => {
      const a = atom(0);
      const unsubscribes = Array.from({ length: 10 }, () => a.subscribe(() => {}));
      unsubscribes.forEach((u) => u());
    },
    microBenchOptions
  );

  bench(
    'notify subscribers (1 subscriber)',
    () => {
      const a = atom(0);
      let count = 0;
      a.subscribe(() => {
        count++;
      });
      a.value = 1;
    },
    microBenchOptions
  );

  bench(
    'notify subscribers (10 subscribers)',
    () => {
      const a = atom(0);
      let count = 0;
      for (let i = 0; i < 10; i++) {
        a.subscribe(() => {
          count++;
        });
      }
      a.value = 1;
    },
    microBenchOptions
  );
});

describe('Atom Disposal', () => {
  bench(
    'dispose atom',
    () => {
      const a = atom(0);
      a.dispose();
    },
    microBenchOptions
  );

  bench(
    'dispose atom with subscribers',
    () => {
      const a = atom(0);
      a.subscribe(() => {});
      a.subscribe(() => {});
      a.subscribe(() => {});
      a.dispose();
    },
    microBenchOptions
  );

  bench(
    'dispose 100 atoms',
    () => {
      const atoms = Array.from({ length: 100 }, (_, i) => atom(i));
      atoms.forEach((a) => a.dispose());
    },
    microBenchOptions
  );
});
