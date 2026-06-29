import { bench, describe } from 'vitest';
import { Result } from '../dist';
import { keep, REPEATS } from './setup';

describe('Result', () => {
  const okValue = Result.ok(1);
  const errorObject = new Error('test');
  const errorValue = Result.err(errorObject);

  // Pre-generate data structures to minimize runtime overhead inside benchmark loops.
  const mixedResults = Array.from({ length: REPEATS }, (_, i) =>
    i % 2 === 0 ? okValue : errorValue
  );
  const mixedFlags = Array.from({ length: REPEATS }, (_, i) => i % 2 === 0);

  const resultMatcher = {
    ok: (value: number) => value,
    err: (_error: Error) => -1,
  };

  const okCallback = () => 1;
  const errorCallback = () => {
    throw errorObject; // Reuse pre-allocated error to avoid V8 stack trace generation overhead in loops
  };
  const mixedCallbacks = Array.from({ length: REPEATS }, (_, i) =>
    i % 2 === 0 ? okCallback : errorCallback
  );

  const mapCallback = (value: number) => value + 1;

  bench(`Result.ok creation (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.ok(i));
    }
  });

  bench(`Result.err creation (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.err(errorObject));
    }
  });

  bench(`isOk (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.isOk(okValue));
    }
  });

  bench(`unwrapOr (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.unwrapOr(mixedResults[i], 0));
    }
  });

  bench(`map (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.map(okValue, mapCallback));
    }
  });

  bench(`Result.match (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.match(mixedResults[i], resultMatcher));
    }
  });

  bench(`Result.tryCatch (mixed, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(Result.tryCatch(mixedCallbacks[i]));
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
          keep(mixedCallbacks[i]());
        } catch {
          keep(-1);
        }
      }
    });
  });
});
