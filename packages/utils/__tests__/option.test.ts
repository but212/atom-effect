import { describe, expect, it, vi } from 'vitest';
import { fromNullable, None, type Option, Some } from '@/index';

describe('Option<T>', () => {
  describe('Factories & Creation', () => {
    it('Some() should encapsulate a value regardless of what it is', () => {
      const opt = Some(42);
      expect(opt.ok).toBe(true);
      expect(opt.unwrap()).toBe(42);
    });

    it('Some() should be a strict constructor (preserving null/undefined)', () => {
      expect(Some(null).ok).toBe(true);
      expect(Some(null).unwrap()).toBe(null);
      expect(Some(undefined).ok).toBe(true);
      expect(Some(undefined).unwrap()).toBe(undefined);
    });

    it('None should represent the absence of a value', () => {
      expect(None.ok).toBe(false);
    });

    it('None should be a singleton for operational efficiency', () => {
      expect(None.map((x) => x)).toBe(None);
      expect(None.andThen(() => Some(1))).toBe(None);
      expect(None.filter(() => true)).toBe(None);
    });

    it('fromNullable() should normalize nullish values to None', () => {
      expect(fromNullable(null)).toBe(None);
      expect(fromNullable(undefined)).toBe(None);

      const someZero = fromNullable(0);
      expect(someZero.ok).toBe(true);
      expect(someZero.unwrap()).toBe(0);

      expect(fromNullable('').ok).toBe(true);
      expect(fromNullable(false).ok).toBe(true);
    });
  });

  describe('Identification & Type Guards', () => {
    it('should correctly identify variants via ok, isSome, and isNone', () => {
      const s = Some(1);
      const n = None;

      expect(s.ok).toBe(true);
      expect(s.isSome()).toBe(true);
      expect(s.isNone()).toBe(false);

      expect(n.ok).toBe(false);
      expect(n.isSome()).toBe(false);
      expect(n.isNone()).toBe(true);
    });

    it('should act as a reliable type guard in control flow', () => {
      const opt: Option<number> = Some(42);
      if (opt.isSome()) {
        const val: number = opt.value;
        expect(val).toBe(42);
      }

      if (None.isNone()) {
        expect(true).toBe(true);
      }
    });
  });

  describe('Extraction & Recovery', () => {
    describe('unwrap', () => {
      it('should return value for Some', () => {
        expect(Some(10).unwrap()).toBe(10);
      });

      it('should throw for None', () => {
        expect(() => None.unwrap()).toThrow('Option.unwrap() on None');
      });
    });

    describe('unwrapOr', () => {
      it('should return value for Some', () => {
        expect(Some(10).unwrapOr(20)).toBe(10);
      });

      it('should return fallback for None', () => {
        const opt = None as Option<number>;
        expect(opt.unwrapOr(20)).toBe(20);
      });
    });

    describe('unwrapOrElse', () => {
      it('should be lazy and return value for Some', () => {
        const fallback = vi.fn(() => 20);
        expect(Some(10).unwrapOrElse(fallback)).toBe(10);
        expect(fallback).not.toHaveBeenCalled();
      });

      it('should execute and return result for None', () => {
        const fallback = vi.fn(() => 20);
        const opt = None as Option<number>;
        expect(opt.unwrapOrElse(fallback)).toBe(20);
        expect(fallback).toHaveBeenCalled();
      });
    });
  });

  describe('Transformations', () => {
    describe('map', () => {
      it('should transform Some values', () => {
        const square = (n: number) => n * n;
        expect(Some(3).map(square).unwrap()).toBe(9);
      });

      it('should bypass None values', () => {
        expect(None.map((n: number) => n * n)).toBe(None);
      });

      it('should not normalize results (allowing Some(null))', () => {
        const result = Some(1).map(() => null);
        expect(result.ok).toBe(true);
        expect(result.unwrap()).toBe(null);
      });
    });

    describe('andThen (FlatMap)', () => {
      it('should chain operations that return Options', () => {
        const getLength = (s: string) => Some(s.length);
        expect(Some('hello').andThen(getLength).unwrap()).toBe(5);
        expect(Some('').andThen(() => None)).toBe(None);
      });

      it('should bypass None', () => {
        expect(None.andThen((s: string) => Some(s))).toBe(None);
      });
    });

    describe('filter', () => {
      it('should keep value if predicate matches', () => {
        expect(Some(10).filter((n) => n > 0).ok).toBe(true);
      });

      it('should drop value if predicate fails', () => {
        expect(Some(-5).filter((n) => n > 0)).toBe(None);
      });

      it('should bypass None', () => {
        expect(None.filter(() => true)).toBe(None);
      });

      it('should support type narrowing', () => {
        const opt: Option<string | number> = Some('hello');
        const isString = (v: string | number): v is string => typeof v === 'string';
        const result = opt.filter(isString).map((s) => s.toUpperCase());
        expect(result.unwrap()).toBe('HELLO');
      });
    });
  });

  describe('Interoperability & Equality', () => {
    it('toNullable() should return T or null', () => {
      expect(Some(1).toNullable()).toBe(1);
      expect(None.toNullable()).toBe(null);
    });

    it('toUndefined() should return T or undefined', () => {
      expect(Some(1).toUndefined()).toBe(1);
      expect(None.toUndefined()).toBe(undefined);
    });

    it('equals() should compare structure and value', () => {
      expect(Some(42).equals(Some(42))).toBe(true);
      expect(Some(42).equals(Some(43))).toBe(false);
      expect(Some(42).equals(None)).toBe(false);
      expect(None.equals(None)).toBe(true);
      expect(None.equals(Some(1))).toBe(false);
    });
  });

  describe('Pattern Matching', () => {
    it('match() should execute the correct branch', () => {
      const matcher = {
        some: (v: number) => v * 2,
        none: () => -1,
      };
      expect(Some(42).match(matcher)).toBe(84);
      expect(None.match(matcher)).toBe(-1);
    });
  });

  describe('Composition & Complex Pipelines', () => {
    it('should handle nested options gracefully', () => {
      const nested = Some(Some(42));
      expect(nested.unwrap().unwrap()).toBe(42);
    });

    it('should support complex functional pipelines', () => {
      const pipeline = (val: string | null) =>
        fromNullable(val)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((s) => s.toUpperCase())
          .andThen((s) => (s === 'SECRET' ? Some(1337) : None))
          .unwrapOr(-1);

      expect(pipeline('  secret  ')).toBe(1337);
      expect(pipeline('   ')).toBe(-1);
      expect(pipeline(null)).toBe(-1);
      expect(pipeline('wrong')).toBe(-1);
    });

    it('should handle various falsy values without coercion', () => {
      expect(
        Some(0)
          .map((n) => n + 1)
          .unwrap()
      ).toBe(1);
      expect(
        Some('')
          .map((s) => `${s}X`)
          .unwrap()
      ).toBe('X');
      expect(
        Some(false)
          .map((b) => !b)
          .unwrap()
      ).toBe(true);
    });
  });
});
