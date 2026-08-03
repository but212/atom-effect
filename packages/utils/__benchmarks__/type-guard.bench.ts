import { bench, describe } from 'vitest';
import { isPromise } from '../dist';
import { keep, REPEATS } from './setup';

describe('type-guard', () => {
  const promise = Promise.resolve();
  const thenable = { then: () => {} };
  const emptyObject = {};

  const rawInputs = [promise, thenable, emptyObject, null, undefined];
  // Pre-generate mixed inputs of length REPEATS to avoid random selection overhead in the benchmark loop
  const mixedInputs = Array.from({ length: REPEATS }, (_, i) => rawInputs[i % rawInputs.length]);

  bench(`isPromise: native promise (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(isPromise(promise));
    }
  });

  bench(`isPromise: thenable (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(isPromise(thenable));
    }
  });

  bench(`isPromise: object (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(isPromise(emptyObject));
    }
  });

  bench(`isPromise: mixed data (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(isPromise(mixedInputs[i]));
    }
  });
});
