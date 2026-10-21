import { describe, expect, it } from 'vitest';
import { Result } from '@/index';

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

    it('Result.isErr() should act as a reliable compiler type guard', () => {
      expect(Result.isErr(Result.ok(1))).toBe(false);
      expect(Result.isErr(Result.err('e'))).toBe(true);
    });
  });

  describe('Extraction', () => {
    it('Result.unwrap() should return the value or throw error', () => {
      expect(Result.unwrap(Result.ok(42))).toBe(42);
      expect(() => Result.unwrap(Result.err('fail'))).toThrow();
    });
  });

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
      const resultObject = Result.tryCatch(() => {
        throw { key: 'value' };
      });
      expect(resultObject.ok).toBe(false);
      if (Result.isErr(resultObject)) {
        expect(resultObject.error.message).toBe('[object Object]');
        expect(resultObject.error.cause).toEqual({ key: 'value' });
      }

      const nullResult = Result.tryCatch(() => {
        throw null;
      });
      expect(nullResult.ok).toBe(false);
      if (Result.isErr(nullResult)) {
        expect(nullResult.error.message).toBe('Unknown error');
        expect(nullResult.error.cause).toBeNull();
      }

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
});
