import { describe, test } from 'vitest';
import { isPromise } from '../dist';
import { keep, REPEATS } from './setup';

describe('type-guard', () => {
  const promise = Promise.resolve();
  const thenable = { then: () => {} };
  const emptyObject = {};

  const rawInputs = [promise, thenable, emptyObject, null, undefined];
  // Pre-generate mixed inputs of length REPEATS to avoid random selection overhead in the benchmark loop
  const mixedInputs = Array.from({ length: REPEATS }, (_, i) => rawInputs[i % rawInputs.length]);

  const repeats = REPEATS;
  const _keep = keep;
  const _isPromise = isPromise;

  test('isPromise checks comparison', async ({ bench }) => {
    await bench.compare(
      bench(`isPromise: native promise (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(_isPromise(promise));
        }
      }),
      bench(`isPromise: thenable (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(_isPromise(thenable));
        }
      }),
      bench(`isPromise: object (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(_isPromise(emptyObject));
        }
      }),
      bench(`isPromise: mixed data (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(_isPromise(mixedInputs[i]));
        }
      })
    );
  });
});
