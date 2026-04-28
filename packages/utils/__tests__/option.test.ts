import { describe, expect, it, vi } from 'vitest';
import { fromNullable, isOption, None, Ok, type Option, Some } from '@/index';

describe('Option<T>', () => {
  describe('Core Creation & Factories', () => {
    it('Some() should encapsulate any value including nullish ones', () => {
      expect(Some(42).unwrap()).toBe(42);
      expect(Some(null).unwrap()).toBe(null);
      expect(Some(undefined).unwrap()).toBe(undefined);
    });

    it('None should represent the singleton absence of value', () => {
      expect(None.ok).toBe(false);
      expect(None.isNone()).toBe(true);
      // Ensure it stays None after operations (singleton check)
      expect(None.map((x) => x)).toBe(None);
      expect(None.filter(() => true)).toBe(None);
    });

    it('fromNullable() should correctly normalize values', () => {
      expect(fromNullable(null)).toBe(None);
      expect(fromNullable(undefined)).toBe(None);
      expect(fromNullable(0).ok).toBe(true);
      expect(fromNullable('').ok).toBe(true);
      expect(fromNullable(false).ok).toBe(true);
    });
  });

  describe('Type Identification & Guards', () => {
    it('isOption utility should accurately detect Option instances', () => {
      expect(isOption(Some(1))).toBe(true);
      expect(isOption(None)).toBe(true);
      expect(isOption({ ok: true })).toBe(false);
      expect(isOption(null)).toBe(false);
      expect(isOption({})).toBe(false);
      expect(isOption(Ok(1))).toBe(false);
    });

    it('should correctly identify variants via instance methods', () => {
      const s = Some(1);
      const n = None;
      expect(s.isSome()).toBe(true);
      expect(s.isNone()).toBe(false);
      expect(n.isSome()).toBe(false);
      expect(n.isNone()).toBe(true);
    });

    it('should act as a reliable type guard in control flow', () => {
      const opt: Option<number> = Some(42);
      if (opt.isSome()) {
        const val: number = opt.value; // TypeScript should know value exists here
        expect(val).toBe(42);
      }
    });
  });

  describe('Extraction & Fallbacks', () => {
    it('unwrap() should return value or throw', () => {
      expect(Some(10).unwrap()).toBe(10);
      expect(() => None.unwrap()).toThrow('Option.unwrap() on None');
    });

    it('unwrapOr() should provide a default value', () => {
      expect(Some(10).unwrapOr(20)).toBe(10);
      expect((None as Option<number>).unwrapOr(20)).toBe(20);
    });

    it('unwrapOrElse() should be lazy', () => {
      const fallback = vi.fn(() => 20);
      expect(Some(10).unwrapOrElse(fallback)).toBe(10);
      expect(fallback).not.toHaveBeenCalled();

      expect((None as Option<number>).unwrapOrElse(fallback)).toBe(20);
      expect(fallback).toHaveBeenCalled();
    });
  });

  describe('Functional Transformations', () => {
    it('map() should transform inner values', () => {
      expect(
        Some(3)
          .map((n) => n * n)
          .unwrap()
      ).toBe(9);
      expect(None.map((n: number) => n * n)).toBe(None);
    });

    it('andThen() should chain nested Options', () => {
      const getLength = (s: string) => Some(s.length);
      expect(Some('hello').andThen(getLength).unwrap()).toBe(5);
      expect(Some('').andThen(() => None)).toBe(None);
      expect(None.andThen((s: string) => Some(s))).toBe(None);
    });

    it('filter() should drop values based on predicate', () => {
      expect(
        Some(10)
          .filter((n) => n > 0)
          .isSome()
      ).toBe(true);
      expect(Some(-5).filter((n) => n > 0)).toBe(None);
      expect(None.filter(() => true)).toBe(None);
    });

    it('filter() should support type narrowing', () => {
      const opt: Option<string | number> = Some('hello');
      const isString = (v: string | number): v is string => typeof v === 'string';
      const result = opt.filter(isString).map((s) => s.toUpperCase());
      expect(result.unwrap()).toBe('HELLO');
    });
  });

  describe('Equality & Interoperability', () => {
    it('should convert to nullable/undefined', () => {
      expect(Some(1).toNullable()).toBe(1);
      expect(None.toNullable()).toBe(null);
      expect(Some(1).toUndefined()).toBe(1);
      expect(None.toUndefined()).toBe(undefined);
    });

    it('equals() should perform deep equality check', () => {
      expect(Some(42).equals(Some(42))).toBe(true);
      expect(Some(42).equals(Some(43))).toBe(false);
      expect(Some(42).equals(None)).toBe(false);
      expect(None.equals(None)).toBe(true);
      // Ensure plain objects or other container types with similar structure are not identified as Options
      expect(Some(1).equals({ ok: true, value: 1 })).toBe(false);
      expect(Some(1).equals(Ok(1))).toBe(false);
    });

    it('match() should execute the correct branch', () => {
      const matcher = { some: (v: number) => v * 2, none: () => -1 };
      expect(Some(42).match(matcher)).toBe(84);
      expect(None.match(matcher)).toBe(-1);
    });
  });

  describe('Modern Features', () => {
    it('should be iterable (for...of)', () => {
      const results: number[] = [];
      for (const val of Some(42)) results.push(val);
      expect(results).toEqual([42]);

      const noneResults: number[] = [];
      for (const val of None) noneResults.push(val);
      expect(noneResults).toEqual([]);
    });

    it('should support spread operator and destructuring', () => {
      expect([...Some(1), ...None, ...Some(2)]).toEqual([1, 2]);

      const [val1] = Some(42);
      expect(val1).toBe(42);

      const [val2] = None;
      expect(val2).toBeUndefined();
    });

    it('should have descriptive string representation', () => {
      expect(Some(42).toString()).toBe('Some(42)');
      expect(None.toString()).toBe('None');
      expect(Object.prototype.toString.call(Some(1))).toBe('[object Some]');
      expect(Object.prototype.toString.call(None)).toBe('[object None]');
    });
  });

  describe('Algebraic Laws', () => {
    const f = (x: number) => x * 2;
    const g = (x: number) => x.toString();
    const mf = (n: number) => Some(n + 1);
    const mg = (n: number) => (n % 2 === 0 ? Some(n * 2) : None);

    describe('Functor Laws', () => {
      it('Identity: map(x => x) == opt', () => {
        expect(
          Some(42)
            .map((x) => x)
            .equals(Some(42))
        ).toBe(true);
        expect(None.map((x) => x).equals(None)).toBe(true);
      });

      it('Composition: map(f).map(g) == map(g(f(x)))', () => {
        const some = Some(10);
        expect(
          some
            .map(f)
            .map(g)
            .equals(some.map((x) => g(f(x))))
        ).toBe(true);
        expect(
          None.map(f)
            .map(g)
            .equals(None.map((x) => g(f(x))))
        ).toBe(true);
      });
    });

    describe('Monad Laws', () => {
      it('Left Identity: Some(x).andThen(f) == f(x)', () => {
        expect(Some(5).andThen(mf).equals(mf(5))).toBe(true);
      });

      it('Right Identity: opt.andThen(Some) == opt', () => {
        expect(Some(42).andThen(Some).equals(Some(42))).toBe(true);
        expect(None.andThen(Some).equals(None)).toBe(true);
      });

      it('Associativity', () => {
        const some = Some(10);
        expect(
          some
            .andThen(mf)
            .andThen(mg)
            .equals(some.andThen((x) => mf(x).andThen(mg)))
        ).toBe(true);
        expect(
          None.andThen(mf)
            .andThen(mg)
            .equals(None.andThen((x) => mf(x).andThen(mg)))
        ).toBe(true);
      });
    });
  });
});
