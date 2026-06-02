import { bench, describe } from 'vitest';
import { Option } from '../dist';
import { keep, nextRandom, nextRandomInt, REPEATS } from './setup';

describe('Option', () => {
  const someVal = Option.some(1);
  const noneVal = Option.none;

  bench(`Some creation (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.some(i));
    }
  });

  bench(`isSome (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.isSome(someVal));
    }
  });

  bench(`unwrapOr (mixed, x${REPEATS})`, () => {
    const opts = [someVal, noneVal];
    for (let i = 0; i < REPEATS; i++) {
      const opt = opts[nextRandomInt(2)];
      keep(Option.unwrapOr(opt, 0));
    }
  });

  bench(`map (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.map(someVal, (x) => x + 1));
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
      keep(Option.match(opt, branches));
    }
  });

  bench(`fromNullable (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      const val = nextRandom() > 0.5 ? i : null;
      keep(Option.fromNullable(val));
    }
  });

  describe('Native Comparison (null/undefined)', () => {
    const rawVal = 1;
    const rawNull = null;

    bench(`Literal assignment (x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(i);
      }
    });

    bench(`Null check (x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(rawVal != null);
      }
    });

    bench(`Nullish coalescing (mixed, x${REPEATS})`, () => {
      const vals = [rawVal, rawNull];
      for (let i = 0; i < REPEATS; i++) {
        const val = vals[nextRandomInt(2)];
        keep(val ?? 0);
      }
    });

    bench(`Inline ternary map (x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(rawVal == null ? null : rawVal + 1);
      }
    });

    bench(`If-Else branch (mixed, x${REPEATS})`, () => {
      const vals = [rawVal, rawNull];
      for (let i = 0; i < REPEATS; i++) {
        const val = vals[nextRandomInt(2)];
        if (val == null) {
          keep(0);
        } else {
          keep(val);
        }
      }
    });
  });
});
