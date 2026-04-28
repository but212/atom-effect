import { describe, expect, it, vi } from 'vitest';
import { Err, isResult, Ok, type Result, tryCatch } from '@/index';

describe('Result<T, E>', () => {
  describe('Core Creation & Factories', () => {
    it('Ok() should encapsulate a success value', () => {
      const res = Ok(42);
      expect(res.ok).toBe(true);
      expect(res.unwrap()).toBe(42);
    });

    it('Err() should encapsulate a failure value', () => {
      const err = new Error('fail');
      const res = Err(err);
      expect(res.ok).toBe(false);
      if (res.isErr()) {
        expect(res.error).toBe(err);
      }
    });

    it('should maintain distinct identities for Ok and Err', () => {
      expect(Ok(1).isOk()).toBe(true);
      expect(Ok(1).isErr()).toBe(false);
      expect(Err('fail').isOk()).toBe(false);
      expect(Err('fail').isErr()).toBe(true);
    });
  });

  describe('Type Identification & Guards', () => {
    it('isResult utility should accurately detect Result instances', () => {
      expect(isResult(Ok(1))).toBe(true);
      expect(isResult(Err('e'))).toBe(true);
      expect(isResult({ ok: true, value: 1 })).toBe(false); // No unwrap method
      expect(isResult(null)).toBe(false);
      expect(isResult({})).toBe(false);
    });

    it('should act as a reliable type guard in control flow', () => {
      const res: Result<number, string> = Ok(42);
      if (res.isOk()) {
        const val: number = res.value;
        expect(val).toBe(42);
      }

      const err: Result<number, string> = Err('fail');
      if (err.isErr()) {
        const msg: string = err.error;
        expect(msg).toBe('fail');
      }
    });
  });

  describe('Extraction & Fallbacks', () => {
    it('unwrap() should return value or throw', () => {
      expect(Ok(10).unwrap()).toBe(10);
      expect(() => Err('fail').unwrap()).toThrow();
    });

    it('unwrapOr() should provide a default value', () => {
      expect(Ok(10).unwrapOr(20)).toBe(10);
      expect((Err('fail') as Result<number, string>).unwrapOr(20)).toBe(20);
    });

    it('unwrapOrElse() should be lazy', () => {
      const fallback = vi.fn(() => 20);
      expect(Ok(10).unwrapOrElse(fallback)).toBe(10);
      expect(fallback).not.toHaveBeenCalled();

      expect((Err('fail') as Result<number, string>).unwrapOrElse(fallback)).toBe(20);
      expect(fallback).toHaveBeenCalled();
    });
  });

  describe('Functional Transformations', () => {
    it('map() should transform success values', () => {
      expect(
        Ok(5)
          .map((n) => n * 2)
          .unwrap()
      ).toBe(10);
      const err = Err<number, string>('fail');
      expect(err.map((n) => n * 2).isErr()).toBe(true);
    });

    it('mapErr() should transform error values', () => {
      const res = Err<number, string>('fail').mapErr((s) => s.toUpperCase());
      if (res.isErr()) {
        expect(res.error).toBe('FAIL');
      }
      expect(
        Ok<number, string>(10)
          .mapErr((s) => s.toUpperCase())
          .unwrap()
      ).toBe(10);
    });

    it('andThen() should chain Results and allow error type expansion', () => {
      const checkPos = (n: number): Result<number, string> => (n > 0 ? Ok(n) : Err('neg'));

      expect(Ok<number, string>(10).andThen(checkPos).unwrap()).toBe(10);
      expect(Ok<number, string>(-1).andThen(checkPos).isErr()).toBe(true);
      expect(Err<number, string>('init').andThen(checkPos).isErr()).toBe(true);
    });
  });

  describe('Equality & Interoperability', () => {
    it('toOption() should convert variants correctly', () => {
      expect(Ok(42).toOption().ok).toBe(true);
      expect(Err('fail').toOption().ok).toBe(false);
    });

    it('equals() should perform structural equality check', () => {
      expect(Ok(42).equals(Ok(42))).toBe(true);
      expect(Ok(42).equals(Ok(43))).toBe(false);
      expect(Ok(42).equals(Err(42))).toBe(false);
      expect(Err('fail').equals(Err('fail'))).toBe(true);
      expect(Err('fail').equals(Err('stop'))).toBe(false);
    });

    it('match() should execute the correct branch', () => {
      const matcher = { ok: (v: number) => `v:${v}`, err: (e: string) => `e:${e}` };
      expect(Ok<number, string>(42).match(matcher)).toBe('v:42');
      expect(Err<number, string>('bad').match(matcher)).toBe('e:bad');
    });

    it('toString() should provide descriptive output', () => {
      expect(Ok(42).toString()).toBe('Ok(42)');
      expect(Err('fail').toString()).toBe('Err(fail)');
    });
  });

  describe('Safe Execution (tryCatch)', () => {
    it('should capture success as Ok and errors as Err', () => {
      expect(tryCatch(() => 42).unwrap()).toBe(42);
      const res = tryCatch(() => {
        throw 'oops';
      });
      expect(res.isErr()).toBe(true);
      if (res.isErr()) expect(res.error).toBe('oops');
    });

    it('should handle async functions and return a Promise<Result>', async () => {
      const res = await tryCatch(async () => 42);
      expect(res.unwrap()).toBe(42);

      const errRes = await tryCatch(async () => {
        throw 'async fail';
      });
      expect(errRes.isErr()).toBe(true);
    });
  });

  describe('Algebraic Laws', () => {
    const f = (x: number) => x * 2;
    const g = (x: number) => x.toString();
    const mf = (n: number) => Ok(n + 1);
    const mg = (n: number) => (n % 2 === 0 ? Ok(n * 2) : Err('odd'));

    describe('Functor Laws', () => {
      it('Identity', () => {
        const ok = Ok(42);
        expect(ok.map((x) => x).equals(ok)).toBe(true);
      });

      it('Composition', () => {
        const ok = Ok(10);
        expect(
          ok
            .map(f)
            .map(g)
            .equals(ok.map((x) => g(f(x))))
        ).toBe(true);
      });
    });

    describe('Monad Laws', () => {
      it('Left Identity', () => {
        expect(Ok(5).andThen(mf).equals(mf(5))).toBe(true);
      });

      it('Right Identity', () => {
        const ok = Ok(42);
        expect(ok.andThen(Ok).equals(ok)).toBe(true);
      });

      it('Associativity', () => {
        const ok = Ok(10);
        expect(
          ok
            .andThen(mf)
            .andThen(mg)
            .equals(ok.andThen((x) => mf(x).andThen(mg)))
        ).toBe(true);
      });
    });
  });
});
