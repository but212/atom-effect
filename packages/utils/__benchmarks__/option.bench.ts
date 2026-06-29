import { bench, describe } from 'vitest';
import { Option } from '../dist';
import { keep, REPEATS } from './setup';

describe('Option', () => {
  const someValue = Option.some(1);
  const noneValue = Option.none;

  // Pre-generate data structures to minimize runtime overhead inside benchmark loops.
  const mixedOptions = Array.from({ length: REPEATS }, (_, i) =>
    i % 2 === 0 ? someValue : noneValue
  );
  const nullableValues = Array.from({ length: REPEATS }, (_, i) => (i % 2 === 0 ? i : null));

  const mapCallback = (value: number) => value + 1;
  const matchBranches = {
    some: (value: number) => value,
    none: () => 0,
  };

  bench(`Some creation (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.some(i));
    }
  });

  bench(`isSome (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.isSome(someValue));
    }
  });

  bench(`unwrapOr (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.unwrapOr(mixedOptions[i], 0));
    }
  });

  bench(`map (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.map(someValue, mapCallback));
    }
  });

  bench(`match (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.match(mixedOptions[i], matchBranches));
    }
  });

  bench(`fromNullable (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Option.fromNullable(nullableValues[i]));
    }
  });

  describe('Native Comparison (null/undefined)', () => {
    const rawValue = 1;
    const rawNull = null;
    const mixedRawValues = Array.from({ length: REPEATS }, (_, i) =>
      i % 2 === 0 ? rawValue : rawNull
    );

    bench(`Literal assignment (x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(i);
      }
    });

    bench(`Null check (x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(rawValue != null);
      }
    });

    bench(`Nullish coalescing (mixed, x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(mixedRawValues[i] ?? 0);
      }
    });

    bench(`Inline ternary map (x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(rawValue == null ? null : rawValue + 1);
      }
    });

    bench(`If-Else branch (mixed, x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        const value = mixedRawValues[i];
        if (value == null) {
          keep(0);
        } else {
          keep(value);
        }
      }
    });
  });
});
