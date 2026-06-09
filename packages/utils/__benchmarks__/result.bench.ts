import { bench, describe } from 'vitest';
import { Result } from '../dist';
import { keep, REPEATS } from './setup';

describe('Result', () => {
  const okVal = Result.ok(1);
  const errVal = Result.err(new Error('test'));

  // Pre-generate data structures to minimize runtime overhead inside benchmark loops.
  const mixedResults = Array.from({ length: REPEATS }, (_, i) => (i % 2 === 0 ? okVal : errVal));

  const resultMatcher = {
    ok: (x: number) => x,
    err: (_e: Error) => -1,
  };

  const okFn = () => 1;
  const errFn = () => {
    throw new Error();
  };
  const mixedFns = Array.from({ length: REPEATS }, (_, i) => (i % 2 === 0 ? okFn : errFn));

  bench(`Result.ok creation (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.ok(i));
    }
  });

  bench(`Result.match (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.match(mixedResults[i], resultMatcher));
    }
  });

  bench(`Result.tryCatch (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.tryCatch(mixedFns[i]));
    }
  });
});
