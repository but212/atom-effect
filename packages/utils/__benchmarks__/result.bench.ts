import { describe, test } from 'vitest';
import { Result } from '../dist';
import { keep, REPEATS } from './setup';

describe('Result', () => {
  const errorObject = new Error('test');

  const mixedFlags = Array.from({ length: REPEATS }, (_, i) => i % 2 === 0);

  const okCallback = () => 1;
  const errorCallback = () => {
    throw errorObject; // Reuse pre-allocated error to avoid V8 stack trace generation overhead in loops
  };
  const mixedCallbacks = Array.from({ length: REPEATS }, (_, i) =>
    i % 2 === 0 ? okCallback : errorCallback
  );

  const repeats = REPEATS;
  const _keep = keep;
  const { ok, err, tryCatch } = Result;

  test('Result Operations', async ({ bench }) => {
    await bench.compare(
      bench(`Result.ok creation (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(ok(i));
        }
      }),
      bench(`Result.err creation (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(err(errorObject));
        }
      }),
      bench(`Result.tryCatch (mixed, x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(tryCatch(mixedCallbacks[i]));
        }
      })
    );
  });

  describe('Native Comparison (try/catch)', () => {
    test('native comparison', async ({ bench }) => {
      await bench.compare(
        bench(`Literal assignment (x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) {
            _keep(i);
          }
        }),
        bench(`Boolean flag check (x${repeats})`, () => {
          const isSuccess = true;
          for (let i = 0; i < repeats; i++) {
            _keep(isSuccess);
          }
        }),
        bench(`Ternary error fallback (mixed, x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) {
            _keep(mixedFlags[i] ? 1 : 0);
          }
        }),
        bench(`Native try/catch (mixed, x${repeats})`, () => {
          for (let i = 0; i < repeats; i++) {
            try {
              _keep(mixedCallbacks[i]());
            } catch {
              _keep(-1);
            }
          }
        })
      );
    });
  });
});
