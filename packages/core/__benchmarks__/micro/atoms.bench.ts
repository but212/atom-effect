/**
 * @fileoverview Micro-benchmarks for atom-effect core Atom API
 * @description Standardized performance metrics for atoms creation, reads, writes, and peek.
 */

import { bench, describe } from 'vitest';
import { atom, effect, untracked } from '../../dist';
import { benchEffectOptions, keep, microBenchOptions, REPEATS } from '../utils/setup.js';

describe('Atoms: Core Operations', () => {
  const creationCases = [
    { name: 'baseline: plain object creation', create: (i: number) => ({ value: i }) },
    { name: 'creation: primitive atom', create: (i: number) => atom(i) },
    {
      name: 'baseline: nested object creation',
      create: (i: number) => ({ value: { count: i } }),
    },
    { name: 'creation: object atom', create: (i: number) => atom({ count: i }) },
  ];

  for (const { name, create } of creationCases) {
    bench(
      `${name} (x${REPEATS})`,
      () => {
        for (let i = 0; i < REPEATS; i++) keep(create(i));
      },
      microBenchOptions
    );
  }

  const plainObjects = Array.from({ length: REPEATS }, (_, i) => ({ value: i }));
  const atoms = Array.from({ length: REPEATS }, (_, i) => atom(i));
  let activeEffects: any[] = [];

  const cleanupOptions = {
    ...microBenchOptions,
    setup: () => {
      activeEffects = atoms.map((a) => effect(() => keep(a.value), benchEffectOptions));
    },
    teardown: () => {
      for (const e of activeEffects) e.dispose();
      activeEffects = [];
    },
  };

  bench(
    `baseline: plain object read/write (x${REPEATS})`,
    () => {
      let sum = 0;
      for (const obj of plainObjects) {
        obj.value++;
        sum += obj.value;
      }
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `read/write performance: active (x${REPEATS})`,
    () => {
      let sum = 0;
      for (const a of atoms) {
        a.value++;
        sum += a.value;
      }
      keep(sum);
    },
    cleanupOptions
  );

  bench(
    `untracked read: active (x${REPEATS})`,
    () => {
      untracked(() => {
        let sum = 0;
        for (const a of atoms) sum += a.value;
        keep(sum);
      });
    },
    cleanupOptions
  );
});

describe('Atoms: Read Methods (.value vs .peek())', () => {
  const plainObj = { value: 42 };
  const a = atom(42);

  const readCases = [
    { name: 'baseline: plain object property read', read: () => plainObj.value },
    { name: 'atom.value read', read: () => a.value },
    { name: 'atom.peek() read', read: () => a.peek() },
  ];

  for (const { name, read } of readCases) {
    bench(
      `${name} (x${REPEATS})`,
      () => {
        let sum = 0;
        for (let i = 0; i < REPEATS; i++) sum += read();
        keep(sum);
      },
      microBenchOptions
    );
  }
});
