/**
 * @fileoverview Batch micro-benchmarks
 * @description Benchmarks for batch update operations
 */

import { bench, describe } from 'vitest';
import { atom, batch, computed, effect } from '../../src/index.js';
import { benchEffectOptions, microBenchOptions } from '../utils/setup.js';

const REPEATS = 1000;

describe('Batch Operations', () => {
  const a = atom(0);
  const b = atom(0);

  bench(
    `batch update 2 atoms (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        // Toggle values
        const val = a.value === 0 ? 1 : 0;
        batch(() => {
          a.value = val;
          b.value = val;
        });
      }
    },
    microBenchOptions
  );

  const atoms10 = Array.from({ length: 10 }, () => atom(0));
  bench(
    `batch update 10 atoms (x${REPEATS})`,
    () => {
      for (let j = 0; j < REPEATS; j++) {
        const val = atoms10[0].value === 0 ? 1 : 0;
        batch(() => {
          for (let i = 0; i < 10; i++) {
            atoms10[i].value = val;
          }
        });
      }
    },
    microBenchOptions
  );

  const atoms100 = Array.from({ length: 100 }, () => atom(0));
  bench(
    'batch update 100 atoms',
    () => {
      const val = atoms100[0].value === 0 ? 1 : 0;
      batch(() => {
        for (let i = 0; i < 100; i++) {
          atoms100[i].value = val;
        }
      });
    },
    microBenchOptions
  );
});

describe('Batch vs Non-Batch', () => {
  // Setup for "without batch"
  const atomsNoBatch = Array.from({ length: 10 }, () => atom(0));
  const cNoBatch = computed(() => atomsNoBatch.reduce((sum, a) => sum + a.value, 0));
  let _valNoBatch = 0;
  effect(() => {
    _valNoBatch = cNoBatch.value;
  }, benchEffectOptions);

  bench(
    'without batch: update 10 atoms',
    () => {
      const val = atomsNoBatch[0].value === 0 ? 1 : 0;
      for (let i = 0; i < 10; i++) {
        atomsNoBatch[i].value = val;
      }
    },
    microBenchOptions
  );

  // Setup for "with batch"
  const atomsBatch = Array.from({ length: 10 }, () => atom(0));
  const cBatch = computed(() => atomsBatch.reduce((sum, a) => sum + a.value, 0));
  let _valBatch = 0;
  effect(() => {
    _valBatch = cBatch.value;
  }, benchEffectOptions);

  bench(
    'with batch: update 10 atoms',
    () => {
      const val = atomsBatch[0].value === 0 ? 1 : 0;
      batch(() => {
        for (let i = 0; i < 10; i++) {
          atomsBatch[i].value = val;
        }
      });
    },
    microBenchOptions
  );
});

describe('Nested Batches', () => {
  const a = atom(0);
  const b = atom(0);

  bench(
    `nested batch (2 levels) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const val = a.value === 0 ? 1 : 0;
        batch(() => {
          a.value = val;
          batch(() => {
            b.value = val;
          });
        });
      }
    },
    microBenchOptions
  );

  const atomsNested = Array.from({ length: 5 }, () => atom(0));

  bench(
    `nested batch (5 levels) (x${REPEATS})`,
    () => {
      for (let j = 0; j < REPEATS; j++) {
        const val = atomsNested[0].value === 0 ? 1 : 0;
        batch(() => {
          atomsNested[0].value = val;
          batch(() => {
            atomsNested[1].value = val;
            batch(() => {
              atomsNested[2].value = val;
              batch(() => {
                atomsNested[3].value = val;
                batch(() => {
                  atomsNested[4].value = val;
                });
              });
            });
          });
        });
      }
    },
    microBenchOptions
  );
});

describe('Batch with Computed', () => {
  const a = atom(1);
  const b = atom(2);
  const c = atom(3);
  const sum = computed(() => a.value + b.value + c.value);
  const doubled = computed(() => sum.value * 2);

  bench(
    'batch update atoms with computed chain',
    () => {
      // Use increment to ensure value change
      batch(() => {
        a.value++;
        b.value++;
        c.value++;
      });
      const _ = doubled.value;
    },
    microBenchOptions
  );

  const da = atom(1);
  const db = computed(() => da.value * 2);
  const dc = computed(() => da.value * 3);
  const dd = computed(() => db.value + dc.value);

  bench(
    'batch with diamond dependency',
    () => {
      batch(() => {
        da.value++;
      });
      const _ = dd.value;
    },
    microBenchOptions
  );
});
