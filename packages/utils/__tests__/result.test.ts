import { describe, expect, it, vi } from 'vitest';
import { Err, Ok, Result, tryAsync, tryCatch } from '@/index';

describe('Result Utility', () => {
  // Shared test functions for functional transformations
  const double = (n: number) => n * 2;
  const upper = (s: string) => s.toUpperCase();
  const square = (n: number) => Ok(n * n);
  const fail = (_: number) => Err('stop');

  describe('Core & Construction', () => {
    it('should create variants as plain objects with correct markers', () => {
      expect(Ok(1)).toEqual({ ok: true, value: 1 });
      expect(Err('e')).toEqual({ ok: false, error: 'e' });
    });

    it('should allow constructing complex values and errors', () => {
      const complexVal = { id: 1, data: [1, 2, 3] };
      const complexErr = new Error('fail');
      expect(Ok(complexVal)).toEqual({ ok: true, value: complexVal });
      expect(Err(complexErr)).toEqual({ ok: false, error: complexErr });
    });
  });

  describe('Type Guards', () => {
    describe('Result.isOk / Result.isErr', () => {
      it.each([
        { input: Ok(10), ok: true, err: false },
        { input: Err('fail'), ok: false, err: true },
        { input: { ok: true, value: 1 }, ok: true, err: false },
        { input: { ok: false, error: 'e' }, ok: false, err: true },
      ])('should identify $input correctly', ({ input, ok, err }) => {
        expect(Result.isOk(input as Result<unknown, unknown>)).toBe(ok);
        expect(Result.isErr(input as Result<unknown, unknown>)).toBe(err);
      });
    });

    describe('Result.isResult', () => {
      it.each([
        [Ok(1), true],
        [Err('e'), true],
        [{ ok: true, value: 1 }, true],
        [{ ok: false, error: 'e' }, true],
        [null, false],
        [undefined, false],
        [{}, false],
        [{ ok: true }, false],
        [{ value: 1 }, false],
      ])('should check if %p is a Result', (val, expected) => {
        expect(Result.isResult(val)).toBe(expected);
      });
    });
  });

  describe('Unwrapping & Defaults', () => {
    describe('Result.unwrap()', () => {
      it('should extract value from Ok', () => {
        expect(Result.unwrap(Ok('val'))).toBe('val');
      });

      it('should throw the exact error object from Err', () => {
        const errObj = new Error('fail');
        expect(() => Result.unwrap(Err(errObj))).toThrow(errObj);
        expect(() => Result.unwrap(Err('string error'))).toThrow('string error');
      });
    });

    describe('Result.unwrapOr() / Result.unwrapOrElse()', () => {
      const ok = Ok<number>(10);
      const err = Err<string>('error');

      it('should provide static fallbacks correctly', () => {
        expect(Result.unwrapOr(ok, 0)).toBe(10);
        expect(Result.unwrapOr(err, 0)).toBe(0);
      });

      it('should execute lazy fallbacks correctly', () => {
        const spy = vi.fn(() => 0);
        expect(Result.unwrapOrElse(ok, spy)).toBe(10);
        expect(spy).not.toHaveBeenCalled();

        expect(Result.unwrapOrElse(err, (e) => e.length)).toBe(5);
      });
    });
  });

  describe('Transformations & Mapping', () => {
    describe('Result.map()', () => {
      it('should transform Ok value', () => {
        expect(Result.map(Ok(10), double)).toEqual(Ok(20));
      });

      it('should ignore Err variant', () => {
        const res = Err<string>('e');
        expect(Result.map(res, double)).toBe(res); // Identity check
      });
    });

    describe('Result.mapErr()', () => {
      it('should transform Err value', () => {
        expect(Result.mapErr(Err('fail'), upper)).toEqual(Err('FAIL'));
      });

      it('should ignore Ok variant', () => {
        const res = Ok(10);
        expect(Result.mapErr(res, upper)).toBe(res); // Identity check
      });
    });

    describe('Result.tap() / Result.tapErr()', () => {
      it('should execute side-effects for Ok via tap', () => {
        const spy = vi.fn();
        const res = Ok(42);
        expect(Result.tap(res, spy)).toBe(res);
        expect(spy).toHaveBeenCalledWith(42);

        const errSpy = vi.fn();
        Result.tap(Err('e'), errSpy);
        expect(errSpy).not.toHaveBeenCalled();
      });

      it('should execute side-effects for Err via tapErr', () => {
        const spy = vi.fn();
        const res = Err('failure');
        expect(Result.tapErr(res, spy)).toBe(res);
        expect(spy).toHaveBeenCalledWith('failure');

        const okSpy = vi.fn();
        Result.tapErr(Ok(42), okSpy);
        expect(okSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('Monadic Chaining', () => {
    describe('Result.andThen()', () => {
      it('should chain successful computations', () => {
        expect(Result.andThen(Ok(5), square)).toEqual(Ok(25));
        expect(Result.andThen(Ok(5), fail)).toEqual(Err('stop'));
      });

      it('should short-circuit on existing Err', () => {
        const res = Err<string>('prev');
        expect(Result.andThen(res, square)).toBe(res);
      });
    });
  });

  describe('Pattern Matching & Utilities', () => {
    it('Result.match should dispatch to correct branch', () => {
      const matcher = {
        ok: (v: number) => v + 1,
        err: (e: string) => e.length,
      };
      expect(Result.match(Ok(10), matcher)).toBe(11);
      expect(Result.match(Err('error'), matcher)).toBe(5);
    });

    it('Result.equals should support semantic comparison', () => {
      const a = Ok({ id: 1 });
      const b = Ok({ id: 1 });

      // Default reference check
      expect(Result.equals(a, b)).toBe(false);

      expect(Result.equals(a, b, (va, vb) => va.id === vb.id)).toBe(true);
      expect(Result.equals(Err('e'), Err('e'))).toBe(true);
      expect(Result.equals(Ok(1), Err(1) as unknown as Result<number, number>)).toBe(false);
    });

    it('Result.all should aggregate results', () => {
      expect(Result.all([Ok(1), Ok(2)])).toEqual(Ok([1, 2]));
      expect(Result.all([Ok(1), Err('e'), Ok(2)])).toEqual(Err('e'));
      expect(Result.all([])).toEqual(Ok([]));
    });
  });

  describe('Async & Safe Execution', () => {
    it('should handle sync success and failure', () => {
      expect(Result.unwrap(tryCatch(() => 'sync'))).toBe('sync');
      const err = tryCatch(() => {
        throw new Error('fail');
      });
      expect(Result.isErr(err)).toBe(true);
    });
  });

  describe('Result.tryAsync()', () => {
    it('should handle async success and failure', async () => {
      const ok = await tryAsync(async () => 'async');
      expect(Result.unwrap(ok)).toBe('async');

      const err = await tryAsync(async () => {
        throw 'async fail';
      });
      expect(Result.isErr(err)).toBe(true);
    });
  });

  it('Result.fromPromise should convert Promise to Result', async () => {
    expect(await Result.fromPromise(Promise.resolve('ok'))).toEqual(Ok('ok'));
    expect(await Result.fromPromise(Promise.reject('err'))).toEqual(Err('err'));

    // Thenable compatibility
    const thenable = {
      then: (cb: (v: string) => void) => {
        cb('deferred');
        return thenable;
      },
    };
    expect(await Result.fromPromise(thenable as unknown as PromiseLike<string>)).toEqual(
      Ok('deferred')
    );
  });
});

describe('Algebraic Laws (Formal Verification)', () => {
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

describe('Constraints & Edge Cases', () => {
  it('should preserve error object identity (Pike Rule 5)', () => {
    const complexError = { code: 500, detail: 'Internal Server Error' };
    const res = Err(complexError);
    try {
      Result.unwrap(res);
    } catch (e) {
      expect(e).toBe(complexError);
    }
  });

  it('should return original reference on Err transformation (Pike Rule 5)', () => {
    const err = Err('original error');
    expect(Result.map(err, (v) => v)).toBe(err);
    expect(Result.andThen(err, (v) => Ok(v))).toBe(err);
  });

  it('isErr should not return true for a Promise wrapped in Ok', () => {
    const wrappedPromise = Result.tryCatch(() => (async () => 'hello')());
    expect(Result.isErr(wrappedPromise as unknown as Result<unknown, Error>)).toBe(false);
    expect(Result.isOk(wrappedPromise as unknown as Result<unknown, Error>)).toBe(true);
  });
});
