import { bench, describe } from 'vitest';
import { Result } from '../dist';
import { keep, REPEATS } from './setup';

describe('Result', () => {
  const okVal = Result.ok(1);
  const errObj = new Error('test');
  const errVal = Result.err(errObj);

  // Pre-generate data structures to minimize runtime overhead inside benchmark loops.
  const mixedResults = Array.from({ length: REPEATS }, (_, i) => (i % 2 === 0 ? okVal : errVal));
  const mixedFlags = Array.from({ length: REPEATS }, (_, i) => i % 2 === 0);

  const resultMatcher = {
    ok: (x: number) => x,
    err: (_e: Error) => -1,
  };

  const okFn = () => 1;
  const errFn = () => {
    throw errObj; // Reuse pre-allocated error to avoid V8 stack trace generation overhead in loops
  };
  const mixedFns = Array.from({ length: REPEATS }, (_, i) => (i % 2 === 0 ? okFn : errFn));

  const mapFn = (x: number) => x + 1;

  bench(`Result.ok creation (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.ok(i));
    }
  });

  bench(`Result.err creation (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.err(errObj));
    }
  });

  bench(`isOk (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.isOk(okVal));
    }
  });

  bench(`unwrapOr (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.unwrapOr(mixedResults[i], 0));
    }
  });

  bench(`map (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.map(okVal, mapFn));
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

  describe('Native Comparison (try/catch)', () => {
    bench(`Literal assignment (x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(i);
      }
    });

    bench(`Boolean flag check (x${REPEATS})`, () => {
      const isSuccess = true;
      for (let i = 0; i < REPEATS; i++) {
        keep(isSuccess);
      }
    });

    bench(`Ternary error fallback (mixed, x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        keep(mixedFlags[i] ? 1 : 0);
      }
    });

    bench(`Native try/catch (mixed, x${REPEATS})`, () => {
      for (let i = 0; i < REPEATS; i++) {
        try {
          keep(mixedFns[i]());
        } catch {
          keep(-1);
        }
      }
    });
  });
});
