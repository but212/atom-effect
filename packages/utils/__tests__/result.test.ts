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
  describe('Factories & Constructors', () => {
    it('Result.ok() should wrap present values or reuse the VOID_SUCCESS singleton', () => {
      const successResult = Result.ok(10);
      expect(successResult).toMatchObject({ ok: true, value: 10 });

      const voidResult1 = Result.ok(undefined);
      const voidResult2 = Result.ok(undefined);
      expect(voidResult1).toBe(voidResult2); // Should reuse VOID_SUCCESS
    });

    it('Result.err() should wrap failure values into the Err variant', () => {
      const errorResult = Result.err('failure');
      expect(errorResult).toMatchObject({ ok: false, error: 'failure' });
    });

    it('shared VOID_SUCCESS should be frozen and immutable', () => {
      const voidResult = Result.ok(undefined);
      expect(() => {
        (voidResult as { value: unknown }).value = 1;
      }).toThrow();
    });

    it('Result.fromPredicate() should return Ok of value when predicate evaluates to true', () => {
      const predicateResult = Result.fromPredicate(42, (x) => x > 0);
      expect(Result.unwrap(predicateResult)).toBe(42);
    });

    it('Result.fromPredicate() should narrow type when predicate is a type guard', () => {
      const isString = (val: unknown): val is string => typeof val === 'string';
      const predicateResult = Result.fromPredicate<unknown, string>('hello', isString);
      expect(Result.unwrap(predicateResult)).toBe('hello');
    });

    it('Result.fromPredicate() should return Err with default Error when predicate evaluates to false', () => {
      const predicateResult = Result.fromPredicate(-42, (x) => x > 0);
      expect(Result.isErr(predicateResult)).toBe(true);
      if (Result.isErr(predicateResult)) {
        expect(predicateResult.error).toBeInstanceOf(Error);
        expect(predicateResult.error.message).toBe('Predicate failed');
      }
    });

    it('Result.fromPredicate() should return Err with custom error when errorFactory is provided', () => {
      const customErr = new Error('custom failure');
      const predicateResult = Result.fromPredicate(
        -42,
        (x) => x > 0,
        () => customErr
      );
      expect(predicateResult).toEqual(Result.err(customErr));
    });

    it('Result.fromThrowable() should behave identically to tryCatch', () => {
      const success = Result.fromThrowable(() => 42);
      expect(success).toEqual(Result.ok(42));

      const error = new Error('thrown');
      const failure = Result.fromThrowable(() => {
        throw error;
      });
      expect(failure).toEqual(Result.err(error));
    });
  });

  describe('Type Guards (isResult, isOk, isErr)', () => {
    it('isResult() should detect valid Result instances via symbol/registry', () => {
      expect(isResult(Result.ok(1))).toBe(true);
      expect(isResult(Result.err('fail'))).toBe(true);
      expect(isResult({ ok: true, value: 1 })).toBe(false);
      expect(isResult(null)).toBe(false);
      expect(isResult(undefined)).toBe(false);
      expect(isResult(42)).toBe(false);
    });

    it('isResult() should distinguish Result from Option', () => {
      expect(isResult(Option.some(1))).toBe(false);
    });

    it('isResult() should reject fake Result literals created externally', () => {
      const spoofedResult = {
        ok: true,
        value: 42,
        error: undefined,
        [RESULT_SYMBOL]: true,
      };
      expect(isResult(spoofedResult)).toBe(false);
    });

    it('Result.isOk() and Result.isErr() should act as reliable compiler type guards', () => {
      const successResult = Result.ok(10);
      const errorResult = Result.err('fail');
      expect(Result.isOk(successResult)).toBe(true);
      expect(Result.isOk(errorResult)).toBe(false);
      expect(Result.isErr(successResult)).toBe(false);
      expect(Result.isErr(errorResult)).toBe(true);
    });
  });

  describe('Extraction & Fallbacks', () => {
    it('Result.unwrap() should return the value or throw error', () => {
      expect(Result.unwrap(Result.ok(42))).toBe(42);
      expect(() => Result.unwrap(Result.err('fail'))).toThrow();
    });

    it('Result.expect() should return value or throw custom error message', () => {
      expect(Result.expect(Result.ok(42), 'msg')).toBe(42);
      expect(() => Result.expect(Result.err('fail'), 'Custom error message')).toThrow(
        'Custom error message'
      );
    });

    it('Result.expect() should wrap the original error as the cause parameter', () => {
      const original = 'original error';
      try {
        Result.expect(Result.err(original), 'Custom message');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Error);
        const errorObj = err as Error & { cause?: unknown };
        expect(errorObj.message).toBe('Custom message');
        expect(errorObj.cause).toBe(original);
      }
    });

    it('Result.unwrapOr() should return fallback defaults on Err', () => {
      expect(Result.unwrapOr(Result.ok(42), 10)).toBe(42);
      expect(Result.unwrapOr(Result.err('fail'), 10)).toBe(10);
    });

    it('Result.unwrapOrElse() should lazily compute default fallback when Err', () => {
      const fallback = vi.fn(() => 10);
      expect(Result.unwrapOrElse(Result.ok(42), fallback)).toBe(42);
      expect(fallback).not.toHaveBeenCalled();
      expect(Result.unwrapOrElse(Result.err('fail'), fallback)).toBe(10);
      expect(fallback).toHaveBeenCalled();
    });
  });

  describe('Transformations (map, mapErr, andThen)', () => {
    describe('map()', () => {
      it('should transform the Ok value', () => {
        const successResult = Result.ok(2);
        const mappedResult = Result.map(successResult, (num: number) => num * 2);
        expect(mappedResult).toMatchObject(Result.ok(4));
      });

      it('should preserve the same instance when mapping NaN to NaN', () => {
        const nanResult = Result.ok(NaN);
        const mappedResult = Result.map(nanResult, (num: number) => num);
        expect(mappedResult).toBe(nanResult);
      });

      it('should reuse the Result instance when mapping an object if the returned reference is identical', () => {
        const frozenObj = Object.freeze({ count: 1 });
        const frozenResult = Result.ok(frozenObj);

        const mappedResult = Result.map(frozenResult, (obj) => obj);
        expect(mappedResult).toBe(frozenResult);
      });

      it('should NOT reuse the Result instance when mapping a mutable object if the returned reference is identical', () => {
        const mutableObj = { count: 1 };
        const mutableResult = Result.ok(mutableObj);

        const mappedResult = Result.map(mutableResult, (obj) => {
          obj.count = 2;
          return obj;
        });
        expect(mappedResult).not.toBe(mutableResult);
      });
    });

    describe('mapErr()', () => {
      it('should transform the Err error value', () => {
        const errorResult = Result.err('fail');
        const mappedResult = Result.mapErr(errorResult, (str: string) => str.toUpperCase());
        expect(mappedResult).toMatchObject(Result.err('FAIL'));
      });

      it('should return the original Ok result unmodified', () => {
        const successResult = Result.ok(42);
        const mappedResult = Result.mapErr(successResult, (val: unknown) => `${val}!`);
        expect(mappedResult).toBe(successResult);
      });
    });

    describe('andThen()', () => {
      it('should chain computations returning Results', () => {
        const successResult = Result.ok(1);
        const chainedResult = Result.andThen(successResult, (num: number) => Result.ok(num + 1));
        expect(chainedResult).toMatchObject(Result.ok(2));
      });

      it('should throw an error if the mapper returns an invalid Result', () => {
        const successResult = Result.ok(42);
        const spoofedResult = {
          ok: true,
          value: 42,
          error: undefined,
          [RESULT_SYMBOL]: true,
        } as Result<number, unknown>;

        expect(() => Result.andThen(successResult, () => spoofedResult)).toThrow(
          'Invalid Result instance'
        );
      });

      it('should return the original Err result unmodified', () => {
        const errorResult = Result.err('fail');
        const chainedResult = Result.andThen(errorResult, (val: unknown) => Result.ok(val));
        expect(chainedResult).toBe(errorResult);
      });
    });
  });

  describe('Control Flow Matcher (match)', () => {
    it('Result.match() should execute correct branch callbacks', () => {
      const successResult = Result.ok(10);
      const errorResult = Result.err('error');

      const matcher = {
        ok: (num: number) => num + 1,
        err: (errorString: string) => errorString.length,
      };

      expect(Result.match(successResult, matcher)).toBe(11);
      expect(Result.match(errorResult, matcher)).toBe(5);
    });
  });

  describe('Array Operations (all)', () => {
    it('Result.all() should combine an array of Ok into a Ok of array', () => {
      const combinedResult = Result.all([Result.ok(1), Result.ok(2), Result.ok(3)]);
      expect(Result.unwrap(combinedResult)).toEqual([1, 2, 3]);
    });

    it('Result.all() should return the first Err if any Result is Err (fail-fast)', () => {
      const firstErrorResult = Result.err('first error');
      const secondErrorResult = Result.err('second error');
      const combinedResult = Result.all([
        Result.ok(1),
        firstErrorResult,
        Result.ok(3),
        secondErrorResult,
      ]);
      expect(combinedResult).toBe(firstErrorResult);
    });

    it('Result.all() should return Ok of empty array for empty input array', () => {
      const combinedResult = Result.all([]);
      expect(Result.unwrap(combinedResult)).toEqual([]);
    });
  });

  describe('Equality (equals)', () => {
    it('Result.equals() should perform structural ok-parity and value/error checks', () => {
      expect(Result.equals(Result.ok(42), Result.ok(42))).toBe(true);
      expect(Result.equals(Result.ok(42), Result.ok(43))).toBe(false);
      expect(Result.equals(Result.ok(42), Result.err(new Error('fail')))).toBe(false);
    });

    it('Result.equals() should perform comparison on Err values', () => {
      const errorObject = new Error('fail');
      expect(Result.equals(Result.err(errorObject), Result.err(errorObject))).toBe(true);
    });

    it('Result.equals() should return true for two Ok(NaN) results', () => {
      expect(Result.equals(Result.ok(NaN), Result.ok(NaN))).toBe(true);
    });

    it('Result.equals() should return true for two Err(NaN) results', () => {
      expect(Result.equals(Result.err(NaN), Result.err(NaN))).toBe(true);
    });

    it('Result.equals() should return false for Ok(-0) and Ok(+0)', () => {
      expect(Result.equals(Result.ok(-0), Result.ok(+0))).toBe(false);
    });

    it('Result.equals() should return false for Err(-0) and Err(+0)', () => {
      expect(Result.equals(Result.err(-0), Result.err(+0))).toBe(false);
    });

    it('Result.equals() should reject shape-alike non-Result objects', () => {
      const spoofedResult = {
        ok: true,
        value: 42,
        error: undefined,
        [RESULT_SYMBOL]: true,
      };
      expect(Result.equals(Result.ok(42), spoofedResult as Result<unknown, unknown>)).toBe(false);
    });

    it('Result.equals() should return true when comparing a Result instance to itself', () => {
      const successResult = Result.ok(42);
      expect(Result.equals(successResult, successResult)).toBe(true);
    });

    it('Result.equals() should evaluate to false for identical non-Result objects', () => {
      const invalidResultObject = { ok: true, value: 42, error: undefined };
      expect(
        Result.equals(
          invalidResultObject as Result<unknown, unknown>,
          invalidResultObject as Result<unknown, unknown>
        )
      ).toBe(false);
    });
  });

  describe('Interoperability & Conversion', () => {
    it('Result.toOption() should convert Ok to Option.some and Err to Option.none', () => {
      const successResult = Result.ok(42);
      const errorResult = Result.err('fail');
      expect(Result.toOption(successResult)).toMatchObject(Option.some(42));
      expect(Result.toOption(errorResult)).toBe(Option.none);
    });
  });

  describe('Synchronous & Asynchronous Wrappers (tryCatch, tryAsync)', () => {
    describe('tryCatch()', () => {
      it('should capture synchronous success and failure', () => {
        const successResult = Result.tryCatch(() => 42);
        expect(successResult).toMatchObject(Result.ok(42));

        const error = new Error('fail');
        const errorResult = Result.tryCatch(() => {
          throw error;
        });
        expect(errorResult).toMatchObject(Result.err(error));
      });

      it('should normalize non-Error throws and preserve cause', () => {
        const original = 'not an error object';
        const errorResult = Result.tryCatch(() => {
          throw original;
        });
        expect(errorResult.ok).toBe(false);
        if (Result.isErr(errorResult)) {
          expect(errorResult.error).toBeInstanceOf(Error);
          expect(errorResult.error.message).toBe(original);
          expect(errorResult.error.cause).toBe(original);
        }
      });

      it('should reuse VOID_SUCCESS for undefined returns', () => {
        const voidResult = Result.tryCatch(() => {});
        expect(voidResult).toBe(Result.ok(undefined));
      });

      it('should handle non-stringifiable values gracefully', () => {
        const errorResult = Result.tryCatch(() => {
          throw NON_STRINGIFIABLE;
        });
        expect(errorResult.ok).toBe(false);
        if (Result.isErr(errorResult)) {
          expect(errorResult.error).toBeInstanceOf(Error);
        }
      });

      it('should handle non-string objects, null, and undefined values in ensureError', () => {
        // 1. Non-string object
        const resultObject = Result.tryCatch(() => {
          throw { key: 'value' };
        });
        expect(resultObject.ok).toBe(false);
        if (Result.isErr(resultObject)) {
          expect(resultObject.error.message).toBe('[object Object]');
          expect(resultObject.error.cause).toEqual({ key: 'value' });
        }

        // 2. null
        const nullResult = Result.tryCatch(() => {
          throw null;
        });
        expect(nullResult.ok).toBe(false);
        if (Result.isErr(nullResult)) {
          expect(nullResult.error.message).toBe('Unknown error');
          expect(nullResult.error.cause).toBeNull();
        }

        // 3. undefined
        const undefinedResult = Result.tryCatch(() => {
          throw undefined;
        });
        expect(undefinedResult.ok).toBe(false);
        if (Result.isErr(undefinedResult)) {
          expect(undefinedResult.error.message).toBe('Unknown error');
          expect(undefinedResult.error.cause).toBeUndefined();
        }
      });
    });

    describe('tryAsync()', () => {
      it('should capture asynchronous success and failure', async () => {
        const successResult = await Result.tryAsync(async () => 'async');
        expect(successResult).toMatchObject(Result.ok('async'));

        const error = new Error('async fail');
        const errorResult = await Result.tryAsync(async () => {
          throw error;
        });
        expect(errorResult).toMatchObject(Result.err(error));
      });

      it('should reuse VOID_SUCCESS for undefined returns', async () => {
        const voidResult = await Result.tryAsync(async () => {});
        expect(voidResult).toBe(Result.ok(undefined));
      });

      it('should normalize non-Error throws and preserve cause', async () => {
        const original = 'async failure';
        const errorResult = await Result.tryAsync(async () => {
          throw original;
        });
        expect(errorResult.ok).toBe(false);
        if (Result.isErr(errorResult)) {
          expect(errorResult.error).toBeInstanceOf(Error);
          expect(errorResult.error.message).toBe(original);
          expect(errorResult.error.cause).toBe(original);
        }
      });

      it('should handle non-stringifiable synchronous throws gracefully', async () => {
        const promise = Result.tryAsync(() => {
          throw NON_STRINGIFIABLE;
        });
        await expect(promise).resolves.toBeDefined();
        const errorResult = await promise;
        expect(errorResult.ok).toBe(false);
        if (Result.isErr(errorResult)) {
          expect(errorResult.error).toBeInstanceOf(Error);
        }
      });

      it('should handle non-stringifiable asynchronous rejections gracefully', async () => {
        const promise = Result.tryAsync(async () => {
          throw NON_STRINGIFIABLE;
        });
        await expect(promise).resolves.toBeDefined();
        const errorResult = await promise;
        expect(errorResult.ok).toBe(false);
        if (Result.isErr(errorResult)) {
          expect(errorResult.error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('Algebraic Laws', () => {
    const doubleValue = (x: number) => x * 2;
    const convertToString = (x: number) => x.toString();

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
      const successResult = Result.ok(10);
      const firstResult = Result.map(Result.map(successResult, doubleValue), convertToString);
      const secondResult = Result.map(successResult, (x: number) =>
        convertToString(doubleValue(x))
      );
      expect(Result.equals(firstResult, secondResult)).toBe(true);
    });

    it('Monad Left Identity', () => {
      const doubleValue = (x: number) => Result.ok(x * 2);
      expect(Result.equals(Result.andThen(Result.ok(10), doubleValue), doubleValue(10))).toBe(true);
    });

    it('Monad Right Identity', () => {
      const successResult = Result.ok(10);
      expect(Result.equals(Result.andThen(successResult, Result.ok), successResult)).toBe(true);
    });

    it('Monad Associativity', () => {
      const addOne = (x: number) => Result.ok(x + 1);
      const doubleValue = (x: number) => Result.ok(x * 2);
      const successResult = Result.ok(10);

      const lhs = Result.andThen(Result.andThen(successResult, addOne), doubleValue);
      const rhs = Result.andThen(successResult, (x: number) =>
        Result.andThen(addOne(x), doubleValue)
      );
      expect(Result.equals(lhs, rhs)).toBe(true);
    });
  });
});
