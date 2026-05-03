import { bench, describe } from 'vitest';
import { isOption, isPromise, Option } from '../dist';
import { keep, nextRandomInt, REPEATS } from './setup';

describe('type-guard', () => {
  const promise = Promise.resolve();
  const thenable = { then: () => {} };
  const obj = {};
  const option = Option.some(1);

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
      keep(isPromise(obj));
    }
  });

  bench(`isOption: true (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(isOption(option));
    }
  });

  bench(`isOption: false (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(isOption(obj));
    }
  });

  bench(`isPromise: mixed data (x${REPEATS})`, () => {
    const inputs = [promise, thenable, obj, option, null, undefined];
    for (let i = 0; i < REPEATS; i++) {
      // Switch input based on random index
      const input = inputs[nextRandomInt(inputs.length)];
      keep(isPromise(input));
    }
  });
});
