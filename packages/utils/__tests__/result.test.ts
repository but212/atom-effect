import { describe, expect, it, vi } from 'vitest';
import { isResult, Option, Result } from '@/index';

describe('Result', () => {
  describe('isResult()', () => {
    it('should identify Result instances', () => {
      expect(isResult(Result.ok(1))).toBe(true);
      expect(isResult(Result.err('fail'))).toBe(true);
    });

    it('should reject non-Result objects', () => {
      expect(isResult({ ok: true, value: 1 })).toBe(false);
      expect(isResult(null)).toBe(false);
      expect(isResult(undefined)).toBe(false);
      expect(isResult(42)).toBe(false);
    });

    it('should distinguish from Option', () => {
      expect(isResult(Option.some(1))).toBe(false);
    });
  });

  describe('Result.ok / Result.err', () => {
    it('should create valid Result variants', () => {
      const ok = Result.ok(10);
      expect(ok).toMatchObject({ ok: true, value: 10 });

      const err = Result.err('failure');
      expect(err).toMatchObject({ ok: false, error: 'failure' });
    });

    it('should handle void success via singleton', () => {
      const res1 = Result.ok(undefined);
      const res2 = Result.ok(undefined);
      expect(res1).toBe(res2); // Should reuse VOID_SUCCESS
    });

    it('should prevent mutation of shared instances', () => {
      const res = Result.ok(undefined);
      expect(() => {
        (res as unknown as Record<string, unknown>).value = 1;
      }).toThrow();
    });
  });

  describe('Result.isOk / Result.isErr', () => {
    it('should act as type guards', () => {
      const ok = Result.ok(10);
      const err = Result.err('fail');
      expect(Result.isOk(ok)).toBe(true);
      expect(Result.isOk(err)).toBe(false);
      expect(Result.isErr(ok)).toBe(false);
      expect(Result.isErr(err)).toBe(true);
    });
  });

  describe('Result.match()', () => {
    it('should dispatch to the correct branch', () => {
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
    it('unwrap() should return value or throw', () => {
      expect(Result.unwrap(Result.ok(42))).toBe(42);
      expect(() => Result.unwrap(Result.err('fail'))).toThrow();
    });

    it('expect() should return value or throw with message', () => {
      expect(Result.expect(Result.ok(42), 'msg')).toBe(42);
      expect(() => Result.expect(Result.err('fail'), 'Custom error message')).toThrow(
        'Custom error message'
      );
    });

    it('unwrapOr() should return fallback on error', () => {
      expect(Result.unwrapOr(Result.ok(42), 10)).toBe(42);
      expect(Result.unwrapOr(Result.err('fail'), 10)).toBe(10);
    });

    it('unwrapOrElse() should compute fallback on error', () => {
      const fallback = vi.fn(() => 10);
      expect(Result.unwrapOrElse(Result.ok(42), fallback)).toBe(42);
      expect(fallback).not.toHaveBeenCalled();
      expect(Result.unwrapOrElse(Result.err('fail'), fallback)).toBe(10);
      expect(fallback).toHaveBeenCalled();
    });
  });

  describe('Functional Transformations', () => {
    it('map() should transform inner value', () => {
      const ok = Result.ok(2);
      const mapped = Result.map(ok, (n: number) => n * 2);
      expect(mapped).toMatchObject(Result.ok(4));
    });

    it('mapErr() should transform inner error', () => {
      const err = Result.err('fail');
      const mapped = Result.mapErr(err, (s: string) => s.toUpperCase());
      expect(mapped).toMatchObject(Result.err('FAIL'));
    });

    it('andThen() should chain results', () => {
      const ok = Result.ok(1);
      const chained = Result.andThen(ok, (n: number) => Result.ok(n + 1));
      expect(chained).toMatchObject(Result.ok(2));
    });
  });

  describe('Safety & Robustness', () => {
    it('tryCatch should capture success and failure', () => {
      const ok = Result.tryCatch(() => 42);
      expect(ok).toMatchObject(Result.ok(42));

      const error = new Error('fail');
      const err = Result.tryCatch(() => {
        throw error;
      });
      expect(err).toMatchObject(Result.err(error));
    });

    it('tryCatch should handle non-Error throws', () => {
      const err = Result.tryCatch(() => {
        throw 'not an error object';
      });
      expect(err.ok).toBe(false);
      if (Result.isErr(err)) {
        expect(err.error).toBeInstanceOf(Error);
        expect(err.error.message).toBe('not an error object');
      }
    });

    it('tryCatch should reuse VOID_SUCCESS for undefined returns', () => {
      const res = Result.tryCatch(() => {});
      expect(res).toBe(Result.ok(undefined));
    });
  });

  describe('Result.tryAsync()', () => {
    it('should capture async success and failure', async () => {
      const ok = await Result.tryAsync(async () => 'async');
      expect(ok).toMatchObject(Result.ok('async'));

      const error = new Error('async fail');
      const err = await Result.tryAsync(async () => {
        throw error;
      });
      expect(err).toMatchObject(Result.err(error));
    });

    it('tryAsync should reuse VOID_SUCCESS for undefined returns', async () => {
      const res = await Result.tryAsync(async () => {});
      expect(res).toBe(Result.ok(undefined));
    });
  });

  describe('Interoperability', () => {
    it('toOption should convert to Option', () => {
      const ok = Result.ok(42);
      const err = Result.err('fail');
      expect(Result.toOption(ok)).toMatchObject(Option.some(42));
      expect(Result.toOption(err)).toBe(Option.none);
    });
  });
});
