import { describe, expect, it, vi } from 'vitest';
import { Err, Ok, Result, tryCatch } from '@/index';

describe('Result Utility (Data-centric Refactor)', () => {
  describe('Structural Integrity & Type Guards', () => {
    it('Ok/Err should be plain objects with correct markers', () => {
      const ok = Ok(1);
      const err = Err('e');

      expect(ok).toEqual({ ok: true, value: 1 });
      expect(err).toEqual({ ok: false, error: 'e' });
    });

    it('isOk/isErr guards should work correctly', () => {
      expect(Result.isOk(Ok(true))).toBe(true);
      expect(Result.isOk(Err(false))).toBe(false);
      expect(Result.isErr(Err('error'))).toBe(true);
      expect(Result.isErr(Ok('success'))).toBe(false);
    });

    it('isResult should identify Result objects correctly', () => {
      expect(Result.isResult(Ok(1))).toBe(true);
      expect(Result.isResult(Err('e'))).toBe(true);
      expect(Result.isResult({ ok: true, value: 1 })).toBe(true);
      expect(Result.isResult({ ok: false, error: 'e' })).toBe(true);
      expect(Result.isResult(null)).toBe(false);
      expect(Result.isResult({})).toBe(false);
      expect(Result.isResult({ ok: true })).toBe(false);
    });
  });

  describe('Value Extraction & Fallbacks', () => {
    it('Result.unwrap() should extract value or throw error', () => {
      expect(Result.unwrap(Ok('val'))).toBe('val');
      expect(() => Result.unwrap(Err(new Error('fail')))).toThrow('fail');
      expect(() => Result.unwrap(Err('string error'))).toThrow('string error');
    });

    it('Result.unwrapOr() should provide fallbacks correctly', () => {
      const ok = Ok<number>(10);
      const err = Err<string>('error');

      expect(Result.unwrapOr(ok, 0)).toBe(10);
      expect(Result.unwrapOr(err, 0)).toBe(0);

      expect(Result.unwrapOrElse(ok, () => 0)).toBe(10);
      expect(Result.unwrapOrElse(err, (e) => (e as string).length)).toBe(5);
    });
  });

  describe('Transformations (Map/Chain)', () => {
    it('map() should only transform Ok variants', () => {
      const double = (n: number) => n * 2;
      expect(Result.map(Ok(10), double)).toEqual(Ok(20));
      expect(Result.map(Err<string>('e'), double)).toEqual(Err('e'));
    });

    it('mapErr() should only transform Err variants', () => {
      const upper = (s: string) => s.toUpperCase();
      expect(Result.mapErr(Err('fail'), upper)).toEqual(Err('FAIL'));
      expect(Result.mapErr(Ok(10), upper)).toEqual(Ok(10));
    });

    it('andThen() should enable monadic chaining', () => {
      const square = (n: number) => Ok(n * n);
      const fail = (_: number) => Err('stop');

      expect(Result.andThen(Ok(5), square)).toEqual(Ok(25));
      expect(Result.andThen(Ok(5), fail)).toEqual(Err('stop'));
      expect(Result.andThen(Err<string>('prev'), square)).toEqual(Err('prev'));
    });

    it('tap() should execute side-effects without changing the data', () => {
      const spy = vi.fn();
      const res = Ok(42);

      const tapped = Result.tap(res, spy);
      expect(spy).toHaveBeenCalledWith(42);
      expect(tapped).toBe(res); // Identity check

      const errSpy = vi.fn();
      Result.tap(Err('e'), errSpy);
      expect(errSpy).not.toHaveBeenCalled();
    });

    it('tapErr() should execute side-effects for Err variants', () => {
      const spy = vi.fn();
      const res = Err('failure');

      const tapped = Result.tapErr(res, spy);
      expect(spy).toHaveBeenCalledWith('failure');
      expect(tapped).toBe(res); // Identity check

      const okSpy = vi.fn();
      Result.tapErr(Ok(42), okSpy);
      expect(okSpy).not.toHaveBeenCalled();
    });
  });

  describe('Algebraic Laws (Verification)', () => {
    const f = (n: number) => n + 1;
    const g = (n: number) => n * 2;
    const mf = (n: number) => Ok(n + 1);
    const mg = (n: number) => Ok(n * 2);

    it('Functor Identity: map(id) == id', () => {
      const ok = Ok(10);
      expect(Result.map(ok, (x) => x)).toEqual(ok);
    });

    it('Functor Composition: map(g . f) == map(f).map(g)', () => {
      const ok = Ok(10);
      const left = Result.map(Result.map(ok, f), g);
      const right = Result.map(ok, (x) => g(f(x)));
      expect(Result.equals(left, right)).toBe(true);
    });

    it('Monad Left Identity: andThen(Ok(x), f) == f(x)', () => {
      expect(Result.andThen(Ok(10), mf)).toEqual(mf(10));
    });

    it('Monad Right Identity: andThen(m, Ok) == m', () => {
      const ok = Ok(10);
      expect(Result.andThen(ok, Ok)).toEqual(ok);
    });

    it('Monad Associativity', () => {
      const ok = Ok(10);
      const left = Result.andThen(Result.andThen(ok, mf), mg);
      const right = Result.andThen(ok, (x) => Result.andThen(mf(x), mg));
      expect(Result.equals(left, right)).toBe(true);
    });
  });

  describe('Safe Execution & Batching', () => {
    it('tryCatch should handle sync/async errors', async () => {
      expect(Result.unwrap(tryCatch(() => 'sync'))).toBe('sync');
      expect(
        Result.isErr(
          tryCatch(() => {
            throw 'err';
          })
        )
      ).toBe(true);

      const asyncOk = await tryCatch(async () => 'async');
      expect(Result.unwrap(asyncOk)).toBe('async');
    });

    it('Result.all should aggregate multiple results', () => {
      expect(Result.all([Ok(1), Ok(2)])).toEqual(Ok([1, 2]));
      expect(Result.all([Ok(1), Err('e'), Ok(2)])).toEqual(Err('e'));
      expect(Result.all([])).toEqual(Ok([]));
    });

    it('fromPromise should convert Promise/Thenable to Result', async () => {
      const okRes = await Result.fromPromise(Promise.resolve('success'));
      expect(okRes).toEqual(Ok('success'));

      const errRes = await Result.fromPromise(Promise.reject('fail'));
      expect(errRes).toEqual(Err('fail'));

      // Test Thenable compatibility (like jqXHR)
      const thenable = {
        then: (onSuccess: (val: string) => void) => {
          onSuccess('deferred success');
          return thenable;
        },
      };
      const defRes = await Result.fromPromise(thenable as unknown as PromiseLike<string>);
      expect(defRes).toEqual(Ok('deferred success'));
    });

    it('match should execute the appropriate branch', () => {
      const matcher = { ok: (v: number) => v + 1, err: (e: string) => e.length };
      expect(Result.match(Ok(10), matcher)).toBe(11);
      expect(Result.match(Err('error'), matcher)).toBe(5);
    });
  });

  describe("Pike's Rules Compliance & Data Integrity", () => {
    it('unwrap() should preserve the exact error object (Rule 5)', () => {
      const complexError = { code: 500, detail: 'Internal Server Error' };
      const res = Err(complexError);

      try {
        Result.unwrap(res);
      } catch (e) {
        expect(e).toBe(complexError); // Identity check, not wrapped in Error
        expect((e as typeof complexError).code).toBe(500);
      }
    });

    it('equals() should support semantic comparison (Rules 3 & 4)', () => {
      const a = Ok({ id: 1 });
      const b = Ok({ id: 1 });

      // Default === check (Rules 3, 4 - simple by default)
      expect(Result.equals(a, b)).toBe(false);

      // Semantic deep-ish comparison
      const semanticEq = Result.equals(a, b, (va, vb) => va.id === vb.id);
      expect(semanticEq).toBe(true);
    });

    it('map/andThen should return original reference on failure (Rule 5)', () => {
      const err = Err('original error');

      const mapped = Result.map(err, (v) => `${v} transformed`);
      const chained = Result.andThen(err, (v) => Ok(`${v} chained`));

      expect(mapped).toBe(err); // Referential identity - no new object allocation
      expect(chained).toBe(err); // Referential identity - no new object allocation
    });

    it('all() with empty array should be Ok([]) (Rule 5)', () => {
      const res = Result.all([]);
      expect(res).toEqual(Ok([]));
      expect(Result.isOk(res)).toBe(true);
    });
  });

  describe('Edge Cases (Known Issues)', () => {
    it('isErr should not return true for a Promise (Red Phase)', () => {
      /**
       * @bug Edge Case: Result.tryCatch returns a Promise when handling async logic.
       * If Result.isErr is called on this Promise, it incorrectly returns true because !promise.ok is true.
       */
      const asyncResult = Result.tryCatch(async () => 'hello');

      // This expectation is expected to FAIL in the current implementation
      expect(Result.isErr(asyncResult as unknown as Result<unknown, Error>)).toBe(false);
    });
  });
});
