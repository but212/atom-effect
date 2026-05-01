import { describe, expect, it } from 'vitest';
import { Result } from '@/index';

describe('Result', () => {
  describe('Result.ok / Result.err', () => {
    it('should create valid Result variants', () => {
      const ok = Result.ok(10);
      expect(ok).toEqual({ ok: true, value: 10 });

      const err = Result.err('failure');
      expect(err).toEqual({ ok: false, error: 'failure' });
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

  describe('Result.tryCatch()', () => {
    it('should capture success and failure', () => {
      const ok = Result.tryCatch(() => 42);
      expect(ok).toEqual(Result.ok(42));

      const error = new Error('fail');
      const err = Result.tryCatch(() => {
        throw error;
      });
      expect(err).toEqual(Result.err(error));
    });
  });

  describe('Result.tryAsync()', () => {
    it('should capture async success and failure', async () => {
      const ok = await Result.tryAsync(async () => 'async');
      expect(ok).toEqual(Result.ok('async'));

      const error = new Error('async fail');
      const err = await Result.tryAsync(async () => {
        throw error;
      });
      expect(err).toEqual(Result.err(error));
    });
  });
});
