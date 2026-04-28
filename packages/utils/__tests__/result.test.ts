import { describe, expect, it, vi } from 'vitest';
import { Err, Ok, type Result, tryCatch } from '@/index';

describe('Result<T, E>', () => {
  describe('Factories & State', () => {
    it('should create an Ok variant with the given value', () => {
      const res = Ok(42);
      expect(res.ok).toBe(true);
      expect(res.isOk()).toBe(true);
      expect(res.isErr()).toBe(false);
      expect(res.unwrap()).toBe(42);
    });

    it('should create an Err variant with the given error', () => {
      const error = new Error('failure');
      const res = Err(error);
      expect(res.ok).toBe(false);
      expect(res.isOk()).toBe(false);
      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error).toBe(error);
      }
    });

    it('should maintain class identity for internal implementations', () => {
      expect(Ok(1).constructor.name).toMatch(/OkImpl|Ok/);
      expect(Err('err').constructor.name).toMatch(/ErrImpl|Err/);
    });

    it('should convert to Option correctly', () => {
      expect(Ok(42).toOption().ok).toBe(true);
      expect(Err('fail').toOption().ok).toBe(false);
    });
  });

  describe('Unwrapping & Recovery', () => {
    describe('unwrapOr', () => {
      it('should return the success value for Ok', () => {
        expect(Ok(10).unwrapOr(20)).toBe(10);
      });

      it('should return the fallback value for Err', () => {
        expect(Err<number, number>(5).unwrapOr(20)).toBe(20);
      });
    });

    describe('unwrapOrElse', () => {
      it('should return the success value for Ok', () => {
        const fallback = vi.fn(() => 20);
        expect(Ok(10).unwrapOrElse(fallback)).toBe(10);
        expect(fallback).not.toHaveBeenCalled();
      });

      it('should execute and return fallback value for Err', () => {
        const fallback = vi.fn((err: string) => `fixed ${err}`);
        expect(Err<string, string>('fail').unwrapOrElse(fallback)).toBe('fixed fail');
        expect(fallback).toHaveBeenCalledWith('fail');
      });
    });

    describe('Error Normalization', () => {
      it('should throw the original Error instance when unwrapping Err', () => {
        const err = new Error('fail');
        expect(() => Err(err).unwrap()).toThrow(err);
      });

      it('should normalize non-Error types into Error objects when unwrapping', () => {
        expect(() => Err('string error').unwrap()).toThrow('string error');
        expect(() => Err({ msg: 'object error' }).unwrap()).toThrow('[object Object]');
      });
    });
  });

  describe('Transformations', () => {
    it('should map Ok values while preserving Err', () => {
      const mapper = (n: number) => n * 2;
      expect(Ok(5).map(mapper).unwrap()).toBe(10);

      const err = Err<number, string>('fail');
      expect(err.map(mapper).isErr()).toBe(true);
    });

    it('should map Err values while preserving Ok', () => {
      const errMapper = (s: string) => s.toUpperCase();
      const res = Err<number, string>('fail').mapErr(errMapper);
      expect(
        res.match(
          () => '',
          (e) => e
        )
      ).toBe('FAIL');

      expect(Ok<number, string>(10).mapErr(errMapper).unwrap()).toBe(10);
    });

    it('should chain operations using andThen (monadic bind)', () => {
      const checkPos = (n: number): Result<number, string> => (n > 0 ? Ok(n) : Err('neg'));

      expect(Ok<number, string>(10).andThen(checkPos).unwrap()).toBe(10);
      expect(Ok<number, string>(-1).andThen(checkPos).isErr()).toBe(true);
      expect(Err<number, string>('init').andThen(checkPos).isErr()).toBe(true);
    });

    it('should execute the correct branch in match', () => {
      const onOk = vi.fn((v: number) => `v:${v}`);
      const onErr = vi.fn((e: string) => `e:${e}`);

      expect(Ok<number, string>(42).match(onOk, onErr)).toBe('v:42');
      expect(onOk).toHaveBeenCalledWith(42);

      expect(Err<number, string>('bad').match(onOk, onErr)).toBe('e:bad');
      expect(onErr).toHaveBeenCalledWith('bad');
    });
  });

  describe('Safe Execution Wrappers', () => {
    describe('tryCatch (Synchronous)', () => {
      it('should capture successful return values as Ok', () => {
        const res = tryCatch(() => 42);
        expect(res.unwrap()).toBe(42);
      });

      it('should capture thrown values as Err', () => {
        const res = tryCatch<number, string>(() => {
          throw 'oops';
        });
        expect(res.isErr()).toBe(true);
        expect(
          res.match(
            () => '',
            (e: string) => e
          )
        ).toBe('oops');
      });

      it('should preserve Error objects when thrown', () => {
        const err = new Error('fail');
        const res = tryCatch(() => {
          throw err;
        });
        expect(
          res.match(
            () => null,
            (e: Error) => e
          )
        ).toBe(err);
      });

      it('should automatically handle native Promises', async () => {
        const res = await tryCatch(() => Promise.resolve(42));
        expect(res.unwrap()).toBe(42);
      });

      it('should allow non-promise thenables (e.g. DSLs)', () => {
        const thenable = { then: (cb: (val: number) => void) => cb(42), isDsl: true };
        const res = tryCatch(() => thenable);
        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
          expect(res.value.isDsl).toBe(true);
        }
      });
    });
  });

  describe('Guardrails (Type Safety)', () => {
    it('should distinguish between sync and async return types', () => {
      const syncRes = tryCatch(() => 42);
      expect(syncRes.ok).toBe(true);
      // @ts-expect-error - syncRes is a Result, not a Promise
      syncRes.then;

      const asyncRes = tryCatch(async () => 42);
      // @ts-expect-error - asyncRes is a Promise, not a Result
      asyncRes.ok;
      expect(asyncRes).toBeInstanceOf(Promise);
    });

    it('should enforce type-safe fallback in unwrapOr', () => {
      const res = Ok(10) as Result<number, string>;

      // @ts-expect-error - fallback must match T (number)
      res.unwrapOr('fallback');

      expect(res.unwrapOr(20)).toBe(10);
    });

    it('should enforce type-safe fallback in unwrapOrElse', () => {
      const res = Err('fail') as Result<number, string>;

      // @ts-expect-error - fallback function must return T (number)
      res.unwrapOrElse(() => 'fallback');

      expect(res.unwrapOrElse(() => 20)).toBe(20);
    });
  });
});
