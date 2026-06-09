import { describe, expect, it, vi } from 'vitest';
import { isResult, Option, Result } from '@/index';
import { RESULT_SYMBOL } from '../src/symbols';

// Logic: Shared test value that throws during string conversion to test error-handling robustness
const NON_STRINGIFIABLE = {
  get toString() {
    return null;
  },
};

describe('Result<T, E>', () => {
  describe('Core Factories', () => {
    it('ok() wraps present value or VOID_SUCCESS singleton', () => {
      const ok = Result.ok(10);
      expect(ok).toMatchObject({ ok: true, value: 10 });

      const res1 = Result.ok(undefined);
      const res2 = Result.ok(undefined);
      expect(res1).toBe(res2); // Should reuse VOID_SUCCESS
    });

    it('err() wraps failure values into Err variant', () => {
      const err = Result.err('failure');
      expect(err).toMatchObject({ ok: false, error: 'failure' });
    });

    it('shared VOID_SUCCESS cannot be mutated at runtime', () => {
      const res = Result.ok(undefined);
      expect(() => {
        (res as unknown as Record<string, unknown>).value = 1;
      }).toThrow();
    });
  });

  describe('Type Guards', () => {
    it('isResult utility detects valid Result instances via symbol/registry', () => {
      expect(isResult(Result.ok(1))).toBe(true);
      expect(isResult(Result.err('fail'))).toBe(true);
      expect(isResult({ ok: true, value: 1 })).toBe(false);
      expect(isResult(null)).toBe(false);
      expect(isResult(undefined)).toBe(false);
      expect(isResult(42)).toBe(false);
    });

    it('isResult distinguishes Result from Option', () => {
      expect(isResult(Option.some(1))).toBe(false);
    });

    it('isOk/isErr act as reliable compiler type guards', () => {
      const ok = Result.ok(10);
      const err = Result.err('fail');
      expect(Result.isOk(ok)).toBe(true);
      expect(Result.isOk(err)).toBe(false);
      expect(Result.isErr(ok)).toBe(false);
      expect(Result.isErr(err)).toBe(true);
    });
  });

  describe('Control Flow Matcher', () => {
    it('match() executes correct branch callbacks', () => {
      const ok = Result.ok(10);
      const err = Result.err('error');

      const matcher = {
        ok: (v: number) => v + 1,
        err: (e: string) => e.length,
      };

      expect(Result.match(ok, matcher)).toBe(11);
      expect(Result.match(err, matcher)).toBe(5);
    });
  });

  describe('Extraction & Fallbacks', () => {
    it('unwrap() returns value or throws error', () => {
      expect(Result.unwrap(Result.ok(42))).toBe(42);
      expect(() => Result.unwrap(Result.err('fail'))).toThrow();
    });

    it('expect() returns value or throws custom error message', () => {
      expect(Result.expect(Result.ok(42), 'msg')).toBe(42);
      expect(() => Result.expect(Result.err('fail'), 'Custom error message')).toThrow(
        'Custom error message'
      );
    });

    it('expect() wraps original error as the cause parameter', () => {
      const original = 'original error';
      try {
        Result.expect(Result.err(original), 'Custom message');
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(Error);
        const err = e as Error & { cause?: unknown };
        expect(err.message).toBe('Custom message');
        expect(err.cause).toBe(original);
      }
    });

    it('unwrapOr() returns fallback defaults on Err', () => {
      expect(Result.unwrapOr(Result.ok(42), 10)).toBe(42);
      expect(Result.unwrapOr(Result.err('fail'), 10)).toBe(10);
    });

    it('unwrapOrElse() lazily computes default fallback when Err', () => {
      const fallback = vi.fn(() => 10);
      expect(Result.unwrapOrElse(Result.ok(42), fallback)).toBe(42);
      expect(fallback).not.toHaveBeenCalled();
      expect(Result.unwrapOrElse(Result.err('fail'), fallback)).toBe(10);
      expect(fallback).toHaveBeenCalled();
    });
  });

  describe('Functional Transformations', () => {
    it('map() transforms the Ok value', () => {
      const ok = Result.ok(2);
      const mapped = Result.map(ok, (n: number) => n * 2);
      expect(mapped).toMatchObject(Result.ok(4));
    });

    it('map() preserves same instance when mapping NaN to NaN', () => {
      const ok = Result.ok(NaN);
      const mapped = Result.map(ok, (n: number) => n);
      expect(mapped).toBe(ok);
    });

    it('should return a new Result instance when mapping a mutable object, even if the returned reference is identical', () => {
      const originalObj = { count: 1 };
      const ok = Result.ok(originalObj);

      const mapped = Result.map(ok, (obj) => {
        obj.count = 2; // Mutate in-place
        return obj;
      });

      expect(mapped).not.toBe(ok);
      expect(Result.unwrap(mapped).count).toBe(2);
    });

    it('should reuse the Result instance when mapping a frozen object if the returned reference is identical', () => {
      const frozenObj = Object.freeze({ count: 1 });
      const ok = Result.ok(frozenObj);

      const mapped = Result.map(ok, (obj) => obj);

      expect(mapped).toBe(ok);
    });

    it('mapErr() transforms the Err error value', () => {
      const err = Result.err('fail');
      const mapped = Result.mapErr(err, (s: string) => s.toUpperCase());
      expect(mapped).toMatchObject(Result.err('FAIL'));
    });

    it('andThen() chains computations returning Results', () => {
      const ok = Result.ok(1);
      const chained = Result.andThen(ok, (n: number) => Result.ok(n + 1));
      expect(chained).toMatchObject(Result.ok(2));
    });

    it('should throw an error if the mapper returns an invalid Result', () => {
      const ok = Result.ok(42);
      const fakeResult = {
        ok: true,
        value: 42,
        error: undefined,
        [RESULT_SYMBOL]: true,
      } as unknown as Result<number, unknown>;

      expect(() => Result.andThen(ok, () => fakeResult)).toThrow('Invalid Result instance');
    });
  });

  describe('Synchronous & Asynchronous Wrappers', () => {
    it('tryCatch() captures synchronous success and failure', () => {
      const ok = Result.tryCatch(() => 42);
      expect(ok).toMatchObject(Result.ok(42));

      const error = new Error('fail');
      const err = Result.tryCatch(() => {
        throw error;
      });
      expect(err).toMatchObject(Result.err(error));
    });

    it('tryCatch() normalizes non-Error throws and preserves cause', () => {
      const original = 'not an error object';
      const err = Result.tryCatch(() => {
        throw original;
      });
      expect(err.ok).toBe(false);
      if (Result.isErr(err)) {
        expect(err.error).toBeInstanceOf(Error);
        expect(err.error.message).toBe(original);
        expect(err.error.cause).toBe(original);
      }
    });

    it('tryCatch() reuses VOID_SUCCESS for undefined returns', () => {
      const res = Result.tryCatch(() => {});
      expect(res).toBe(Result.ok(undefined));
    });

    it('tryCatch() handles non-stringifiable values gracefully', () => {
      const res = Result.tryCatch(() => {
        throw NON_STRINGIFIABLE;
      });
      expect(res.ok).toBe(false);
      if (Result.isErr(res)) {
        expect(res.error).toBeInstanceOf(Error);
      }
    });

    it('tryAsync() captures asynchronous success and failure', async () => {
      const ok = await Result.tryAsync(async () => 'async');
      expect(ok).toMatchObject(Result.ok('async'));

      const error = new Error('async fail');
      const err = await Result.tryAsync(async () => {
        throw error;
      });
      expect(err).toMatchObject(Result.err(error));
    });

    it('tryAsync() reuses VOID_SUCCESS for undefined returns', async () => {
      const res = await Result.tryAsync(async () => {});
      expect(res).toBe(Result.ok(undefined));
    });

    it('tryAsync() normalizes non-Error throws and preserves cause', async () => {
      const original = 'async failure';
      const err = await Result.tryAsync(async () => {
        throw original;
      });
      expect(err.ok).toBe(false);
      if (Result.isErr(err)) {
        expect(err.error).toBeInstanceOf(Error);
        expect(err.error.message).toBe(original);
        expect(err.error.cause).toBe(original);
      }
    });

    it('tryAsync() handles non-stringifiable synchronous throws gracefully', async () => {
      const promise = Result.tryAsync(() => {
        throw NON_STRINGIFIABLE;
      });
      await expect(promise).resolves.toBeDefined();
      const res = await promise;
      expect(res.ok).toBe(false);
      if (Result.isErr(res)) {
        expect(res.error).toBeInstanceOf(Error);
      }
    });

    it('tryAsync() handles non-stringifiable asynchronous rejections gracefully', async () => {
      const promise = Result.tryAsync(async () => {
        throw NON_STRINGIFIABLE;
      });
      await expect(promise).resolves.toBeDefined();
      const res = await promise;
      expect(res.ok).toBe(false);
      if (Result.isErr(res)) {
        expect(res.error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Interoperability & Conversion', () => {
    it('toOption() converts Ok to Option.some and Err to Option.none', () => {
      const ok = Result.ok(42);
      const err = Result.err('fail');
      expect(Result.toOption(ok)).toMatchObject(Option.some(42));
      expect(Result.toOption(err)).toBe(Option.none);
    });
  });

  describe('Equality & Comparison', () => {
    it('equals() performs structural ok-parity and value/error checks', () => {
      expect(Result.equals(Result.ok(42), Result.ok(42))).toBe(true);
      expect(Result.equals(Result.ok(42), Result.ok(43))).toBe(false);
      expect(Result.equals(Result.ok(42), Result.err(new Error('fail')))).toBe(false);
    });

    it('equals() performs comparison on Err values', () => {
      const err = new Error('fail');
      expect(Result.equals(Result.err(err), Result.err(err))).toBe(true);
    });

    it('equals() returns true for two Ok(NaN) results', () => {
      expect(Result.equals(Result.ok(NaN), Result.ok(NaN))).toBe(true);
    });

    it('equals() returns true for two Err(NaN) results', () => {
      expect(Result.equals(Result.err(NaN), Result.err(NaN))).toBe(true);
    });

    it('equals() returns false for Ok(-0) and Ok(+0)', () => {
      expect(Result.equals(Result.ok(-0), Result.ok(+0))).toBe(false);
    });

    it('equals() returns false for Err(-0) and Err(+0)', () => {
      expect(Result.equals(Result.err(-0), Result.err(+0))).toBe(false);
    });

    it('equals() rejects shape-alike non-Result objects', () => {
      const spoofed = {
        ok: true,
        value: 42,
        error: undefined,
        [RESULT_SYMBOL]: true,
      };
      expect(Result.equals(Result.ok(42), spoofed as unknown as Result<unknown, unknown>)).toBe(
        false
      );
    });
  });

  describe('Algebraic Laws', () => {
    const f = (x: number) => x * 2;
    const g = (x: number) => x.toString();

    it('Functor Identity', () => {
      expect(
        Result.equals(
          Result.map(Result.ok(42), (x: number) => x),
          Result.ok(42)
        )
      ).toBe(true);
      expect(
        Result.equals(
          Result.map(Result.err('fail'), (x: unknown) => x),
          Result.err('fail')
        )
      ).toBe(true);
    });

    it('Functor Composition', () => {
      const ok = Result.ok(10);
      const res1 = Result.map(Result.map(ok, f), g);
      const res2 = Result.map(ok, (x: number) => g(f(x)));
      expect(Result.equals(res1, res2)).toBe(true);
    });

    it('Monad Left Identity', () => {
      const f = (x: number) => Result.ok(x * 2);
      expect(Result.equals(Result.andThen(Result.ok(10), f), f(10))).toBe(true);
    });

    it('Monad Right Identity', () => {
      const ok = Result.ok(10);
      expect(Result.equals(Result.andThen(ok, Result.ok), ok)).toBe(true);
    });

    it('Monad Associativity', () => {
      const f = (x: number) => Result.ok(x + 1);
      const g = (x: number) => Result.ok(x * 2);
      const ok = Result.ok(10);

      const lhs = Result.andThen(Result.andThen(ok, f), g);
      const rhs = Result.andThen(ok, (x: number) => Result.andThen(f(x), g));
      expect(Result.equals(lhs, rhs)).toBe(true);
    });
  });

  describe('Edge Cases & Security Guards', () => {
    it('isResult rejects fake Result literals created externally', () => {
      // Security: Prevents mock objects bypassing structural matching registry guards.
      const fakeResult = {
        ok: true,
        value: 42,
        error: undefined,
        [RESULT_SYMBOL]: true,
      };
      expect(isResult(fakeResult)).toBe(false);
    });

    it('equals() evaluates to false for identical non-Result objects', () => {
      // Logic: Same-reference check must not validate non-Result values.
      const nonRes = { ok: true, value: 42, error: undefined };
      expect(
        Result.equals(
          nonRes as unknown as Result<unknown, unknown>,
          nonRes as unknown as Result<unknown, unknown>
        )
      ).toBe(false);
    });
  });

  describe('New APIs (all, fromPredicate, fromThrowable)', () => {
    describe('Result.all()', () => {
      it('should combine an array of Ok into a Ok of array', () => {
        const res = Result.all([Result.ok(1), Result.ok(2), Result.ok(3)]);
        expect(Result.unwrap(res)).toEqual([1, 2, 3]);
      });

      it('should return the first Err if any Result is Err (fail-fast)', () => {
        const err1 = Result.err('first error');
        const err2 = Result.err('second error');
        const res = Result.all([Result.ok(1), err1, Result.ok(3), err2]);
        expect(res).toBe(err1);
      });

      it('should return Ok of empty array for empty input array', () => {
        const res = Result.all([]);
        expect(Result.unwrap(res)).toEqual([]);
      });
    });

    describe('Result.fromPredicate()', () => {
      it('should return Ok of value when predicate evaluates to true', () => {
        const res = Result.fromPredicate(42, (x) => x > 0);
        expect(Result.unwrap(res)).toBe(42);
      });

      it('should narrow type when predicate is a type guard', () => {
        const isString = (x: unknown): x is string => typeof x === 'string';
        const res = Result.fromPredicate('hello' as unknown, isString);
        expect(Result.unwrap(res)).toBe('hello');
      });

      it('should return Err with default Error when predicate evaluates to false', () => {
        const res = Result.fromPredicate(-42, (x) => x > 0);
        expect(Result.isErr(res)).toBe(true);
        if (Result.isErr(res)) {
          expect(res.error).toBeInstanceOf(Error);
          expect(res.error.message).toBe('Predicate failed');
        }
      });

      it('should return Err with custom error when errorFactory is provided', () => {
        const customErr = new Error('custom failure');
        const res = Result.fromPredicate(
          -42,
          (x) => x > 0,
          () => customErr
        );
        expect(res).toEqual(Result.err(customErr));
      });
    });

    describe('Result.fromThrowable()', () => {
      it('should behave identically to tryCatch', () => {
        const success = Result.fromThrowable(() => 42);
        expect(success).toEqual(Result.ok(42));

        const error = new Error('thrown');
        const failure = Result.fromThrowable(() => {
          throw error;
        });
        expect(failure).toEqual(Result.err(error));
      });
    });
  });
});
