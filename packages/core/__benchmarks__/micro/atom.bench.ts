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
      void a;
    },
    microBenchOptions
  );

  bench(
    'create atom with object value',
    () => {
      const a = atom({ count: 0, name: 'test' });
      void a;
    },
    microBenchOptions
  );

  bench(
    'create 100 atoms',
    () => {
      const atoms = Array.from({ length: 100 }, (_, i) => atom(i));
      void atoms;
    },
    microBenchOptions
  );
});

describe('Atom Read Operations', () => {
  const a = atom(42);
  const atoms = Array.from({ length: 100 }, (_, i) => atom(i));

  bench(
    'read atom.value',
    () => {
      const _ = a.value;
      void _;
    },
    microBenchOptions
  );

  bench(
    'read atom.peek()',
    () => {
      void a.peek();
    },
    microBenchOptions
  );

  bench(
    'read 100 atoms sequentially',
    () => {
      let sum = 0;
      for (const a of atoms) {
        sum += a.value;
      }
      void sum;
    },
    microBenchOptions
  );
});

describe('Atom Write Operations', () => {
  const a = atom(0);
  const atoms = Array.from({ length: 100 }, (_, i) => atom(i));
  const objAtom = atom({ count: 0 });

  bench(
    'write atom.value (single)',
    () => {
      a.value += 1;
    },
    microBenchOptions
  );

  bench(
    'write atom.value (10 times)',
    () => {
      // Toggle back and forth to ensure changes propagate if connected (though here isolated)
      // and to avoid any "same value" optimization skipping internal logic
      for (let i = 0; i < 10; i++) {
        a.value = i;
      }
    },
    microBenchOptions
  );

  bench(
    'write 100 atoms',
    () => {
      for (let i = 0; i < atoms.length; i++) {
        atoms[i].value += 1;
      }
    },
    microBenchOptions
  );

  bench(
    'write atom with object (shallow)',
    () => {
      // Create new object to ensure reference change
      objAtom.value = { count: objAtom.value.count + 1 };
    },
    microBenchOptions
  );
});

describe('Atom Subscription', () => {
  const a = atom(0);
  const aForNotify = atom(0);
  const aForMultiNotify = atom(0);

  // Setup for notification benchmarks
  aForNotify.subscribe(() => {});

  for (let i = 0; i < 10; i++) {
    aForMultiNotify.subscribe(() => {});
  }

  bench(
    'subscribe and unsubscribe',
    () => {
      const unsubscribe = a.subscribe(() => {});
      unsubscribe();
    },
    microBenchOptions
  );

  bench(
    'subscribe with 10 listeners',
    () => {
      const unsubscribes = Array.from({ length: 10 }, () => a.subscribe(() => {}));
      unsubscribes.forEach((u) => u());
    },
    microBenchOptions
  );

  bench(
    'notify subscribers (1 subscriber)',
    () => {
      aForNotify.value += 1;
    },
    microBenchOptions
  );

  bench(
    'notify subscribers (10 subscribers)',
    () => {
      aForMultiNotify.value += 1;
    },
    microBenchOptions
  );
});

describe('Atom Disposal', () => {
  // Disposal benchmarks necessarily involve creation/cleanup in the loop
  // or a complex setup. We'll keep creation in loop for straightforward disposal testing.
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
