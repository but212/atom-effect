import { bench, describe } from 'vitest';
import { fromNullable, isSome, map, match, None, Some, unwrapOr } from '../dist';
import { keep, nextRandom, nextRandomInt, REPEATS } from './setup';

describe('Option', () => {
  const someVal = Some(1);
  const noneVal = None;

  bench(`Some creation (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Some(i));
    }
  });

  bench(`isSome (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(isSome(someVal));
    }
  });

  bench(`unwrapOr (mixed, x${REPEATS})`, () => {
    const opts = [someVal, noneVal];
    for (let i = 0; i < REPEATS; i++) {
      const opt = opts[nextRandomInt(2)];
      keep(unwrapOr(opt, 0));
    }
  });

  bench(`map (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(map(someVal, (x) => x + 1));
    }
  });

  bench(`match (mixed, x${REPEATS})`, () => {
    const opts = [someVal, noneVal];
    const branches = {
      some: (x: number) => x,
      none: () => 0,
    };
    for (let i = 0; i < REPEATS; i++) {
      const opt = opts[nextRandomInt(2)];
      keep(match(opt, branches));
    }
  });

  bench(`fromNullable (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      const val = nextRandom() > 0.5 ? i : null;
      keep(fromNullable(val));
    }
  });
});
