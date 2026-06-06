import { bench, describe } from 'vitest';
import { Option } from '../dist';
import { keep, REPEATS } from './setup';

describe('Option', () => {
  const someVal = Option.some(1);
  const noneVal = Option.none;

  // Pre-generate data structures to minimize runtime overhead inside benchmark loops.
  const mixedOptions = Array.from({ length: REPEATS }, (_, i) => (i % 2 === 0 ? someVal : noneVal));
  const nullableVals = Array.from({ length: REPEATS }, (_, i) => (i % 2 === 0 ? i : null));

  const mapFn = (x: number) => x + 1;
  const matchBranches = {
    some: (x: number) => x,
    none: () => 0,
  };

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
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.unwrapOr(mixedOptions[i], 0));
    }
  });

  bench(`map (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.map(someVal, mapFn));
    }
  });

  bench(`match (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.match(mixedOptions[i], matchBranches));
    }
  });

  bench(`fromNullable (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.fromNullable(nullableVals[i]));
    }
  });

  describe('Native Comparison (null/undefined)', () => {
    const rawVal = 1;
    const rawNull = null;
    const mixedRawVals = Array.from({ length: REPEATS }, (_, i) =>
      i % 2 === 0 ? rawVal : rawNull
    );

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
      for (let i = 0; i < REPEATS; i++) {
        keep(mixedRawVals[i] ?? 0);
      }
    });

    bench(`Inline ternary map (x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(rawVal == null ? null : rawVal + 1);
      }
    });

    bench(`If-Else branch (mixed, x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        const val = mixedRawVals[i];
        if (val == null) {
          keep(0);
        } else {
          keep(val);
        }
      }
    });
  });
});
