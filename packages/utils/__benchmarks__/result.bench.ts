import { bench, describe } from 'vitest';
import { Result } from '../dist';
import { keep, nextRandomInt, REPEATS } from './setup';

describe('Result', () => {
  const okVal = Result.ok(1);
  const errVal = Result.err(new Error('test'));

  bench(`Result.ok creation (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.ok(i));
    }
  });

  bench(`Result.match (mixed, x${REPEATS})`, () => {
    const results = [okVal, errVal];
    const matcher = {
      ok: (x: number) => x,
      err: (_e: Error) => -1,
    };
    for (let i = 0; i < REPEATS; i++) {
      const res = results[nextRandomInt(2)];
      keep(Result.match(res, matcher));
    }
  });

  bench(`Result.tryCatch (mixed, x${REPEATS})`, () => {
    const fns = [
      () => 1,
      () => {
        throw new Error();
      },
    ];
    for (let i = 0; i < REPEATS; i++) {
      const fn = fns[nextRandomInt(2)];
      keep(Result.tryCatch(fn));
    }
  });
});
