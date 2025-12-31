/**
 * @fileoverview Batch micro-benchmarks
 * @description Benchmarks for batch update operations
 */

import { bench, describe } from 'vitest';
import { atom, batch, computed, effect } from '../../src/index.js';
import { microBenchOptions } from '../utils/setup.js';

describe('Batch Operations', () => {
  bench(
    'batch update 2 atoms',
    () => {
      const a = atom(0);
      const b = atom(0);
      batch(() => {
        a.value = 1;
        b.value = 2;
      });
    },
    microBenchOptions
  );

  bench(
    'batch update 10 atoms',
    () => {
      const atoms = Array.from({ length: 10 }, () => atom(0));
      batch(() => {
        atoms.forEach((a, i) => {
          a.value = i;
        });
      });
    },
    microBenchOptions
  );

  bench(
    'batch update 100 atoms',
    () => {
      const atoms = Array.from({ length: 100 }, () => atom(0));
      batch(() => {
        atoms.forEach((a, i) => {
          a.value = i;
        });
      });
    },
    microBenchOptions
  );
});

describe('Batch vs Non-Batch', () => {
  bench(
    'without batch: update 10 atoms',
    () => {
      const atoms = Array.from({ length: 10 }, () => atom(0));
      const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
      let value = 0;
      const e = effect(() => {
        value = c.value;
      });

      atoms.forEach((a, i) => {
        a.value = i; // Each triggers effect
      });

      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'with batch: update 10 atoms',
    () => {
      const atoms = Array.from({ length: 10 }, () => atom(0));
      const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
      let value = 0;
      const e = effect(() => {
        value = c.value;
      });

      batch(() => {
        atoms.forEach((a, i) => {
          a.value = i; // Effect triggers once
        });
      });

      e.dispose();
    },
    microBenchOptions
  );
});

describe('Nested Batches', () => {
  bench(
    'nested batch (2 levels)',
    () => {
      const a = atom(0);
      const b = atom(0);
      batch(() => {
        a.value = 1;
        batch(() => {
          b.value = 2;
        });
      });
    },
    microBenchOptions
  );

  bench(
    'nested batch (5 levels)',
    () => {
      const atoms = Array.from({ length: 5 }, () => atom(0));
      batch(() => {
        atoms[0].value = 1;
        batch(() => {
          atoms[1].value = 2;
          batch(() => {
            atoms[2].value = 3;
            batch(() => {
              atoms[3].value = 4;
              batch(() => {
                atoms[4].value = 5;
              });
            });
          });
        });
      });
    },
    microBenchOptions
  );
});

describe('Batch with Computed', () => {
  bench(
    'batch update atoms with computed chain',
    () => {
      const a = atom(1);
      const b = atom(2);
      const c = atom(3);
      const sum = computed(() => a.value + b.value + c.value);
      const doubled = computed(() => sum.value * 2);

      batch(() => {
        a.value = 10;
        b.value = 20;
        c.value = 30;
      });

      const _ = doubled.value; // Trigger computation
    },
    microBenchOptions
  );

  bench(
    'batch with diamond dependency',
    () => {
      const a = atom(1);
      const b = computed(() => a.value * 2);
      const c = computed(() => a.value * 3);
      const d = computed(() => b.value + c.value);

      batch(() => {
        a.value = 10;
      });

      const _ = d.value; // Should compute once
    },
    microBenchOptions
  );
});
