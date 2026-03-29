/**
 * @fileoverview Lens micro-benchmarks
 * @description Benchmarks for lens creation, read, and write operations
 */

import { atom } from '@but212/atom-effect';
import { bench, describe } from 'vitest';
import { atomLens, composeLens } from '@/core/lens';
import { microBenchOptions } from '../utils/setup.js';

const REPEATS = 1000;

interface SimpleSchema {
  a: {
    b: {
      c: number;
    };
  };
}

describe('Lens Creation', () => {
  const source = atom<SimpleSchema>({ a: { b: { c: 1 } } });

  bench(
    `create lens (shallow) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const lens = atomLens(source, 'a');
        lens.dispose();
      }
    },
    microBenchOptions
  );

  bench(
    `create lens (deep path) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const lens = atomLens(source, 'a.b.c');
        lens.dispose();
      }
    },
    microBenchOptions
  );

  bench(
    `compose lenses (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const lensA = atomLens(source, 'a');
        const lensB = composeLens(lensA, 'b');
        const lensC = composeLens(lensB, 'c');
        lensC.dispose();
        lensB.dispose();
        lensA.dispose();
      }
    },
    microBenchOptions
  );
});

describe('Lens Performance', () => {
  const source = atom({
    user: {
      profile: {
        name: 'John',
        age: 30,
        settings: {
          theme: 'dark',
          notifications: true,
        },
      },
      posts: Array.from({ length: 10 }, (_, i) => ({ id: i, title: `Post ${i}` })),
    },
  });

  const _nameLens = atomLens(source, 'user.profile.name');
  const themeLens = atomLens(source, 'user.profile.settings.theme');
  const postLens = atomLens(source, 'user.posts.0.title');

  bench(
    `read via lens (deep) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        void themeLens.value;
      }
    },
    microBenchOptions
  );

  bench(
    `write via lens (no change - structural sharing) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        themeLens.value = 'dark';
      }
    },
    microBenchOptions
  );

  bench(
    `write via lens (with change) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        themeLens.value = i % 2 === 0 ? 'light' : 'dark';
      }
    },
    microBenchOptions
  );

  bench(
    `write via lens (array element) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        postLens.value = `Updated ${i}`;
      }
    },
    microBenchOptions
  );
});

describe('Lens Subscription Propagation', () => {
  const source = atom({ a: { b: { c: 1 } } });
  const lens = atomLens(source, 'a.b.c');

  let _val = 0;
  lens.subscribe((newVal) => {
    _val = newVal!;
  });

  bench(
    `propagate change from source to lens (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        source.value = { a: { b: { c: i } } };
      }
    },
    microBenchOptions
  );

  bench(
    `propagate change from lens to source (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        lens.value = i;
      }
    },
    microBenchOptions
  );
});
