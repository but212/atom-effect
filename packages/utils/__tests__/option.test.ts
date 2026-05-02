import { describe, expect, it, vi } from 'vitest';
import { isOption, Option } from '@/index';

describe('Option<T>', () => {
  describe('Core Creation & Factories', () => {
    it('some() should encapsulate any value', () => {
      expect(Option.unwrap(Option.some(42))).toBe(42);
      expect(Option.unwrap(Option.some(null))).toBe(null);
      expect(Option.unwrap(Option.some(undefined))).toBe(undefined);
    });

    it('none should represent absence', () => {
      expect(Option.none.ok).toBe(false);
      expect(Option.isNone(Option.none)).toBe(true);
      expect(Option.map(Option.none, (x: unknown) => x)).toBe(Option.none);
      expect(Option.filter(Option.none, () => true)).toBe(Option.none);
    });

    it('fromNullable() should correctly normalize values', () => {
      expect(Option.fromNullable(null)).toBe(Option.none);
      expect(Option.fromNullable(undefined)).toBe(Option.none);
      expect(Option.fromNullable(0).ok).toBe(true);
    });
  });

  describe('Type Identification & Guards', () => {
    it('isOption utility should detect Options via symbol', () => {
      expect(isOption(Option.some(1))).toBe(true);
      expect(isOption(Option.none)).toBe(true);
      expect(isOption({ ok: true })).toBe(false);
    });

    it('isSome/isNone should act as reliable type guards', () => {
      const opt: Option<number> = Option.some(42);
      if (Option.isSome(opt)) {
        const val: number = opt.value;
        expect(val).toBe(42);
      }
    });
  });

  describe('Extraction & Fallbacks', () => {
    it('unwrap() should return value or throw', () => {
      expect(Option.unwrap(Option.some(10))).toBe(10);
      expect(() => Option.unwrap(Option.none)).toThrow('Option.unwrap() on None');
    });

    it('unwrapOr() should provide a default value', () => {
      expect(Option.unwrapOr(Option.some(10), 20)).toBe(10);
      expect(Option.unwrapOr(Option.none as Option<number>, 20)).toBe(20);
    });

    it('unwrapOrElse() should be lazy and return fallback value when None', () => {
      const fallback = vi.fn(() => 20);
      expect(Option.unwrapOrElse(Option.some(10), fallback)).toBe(10);
      expect(fallback).not.toHaveBeenCalled();

      expect(Option.unwrapOrElse(Option.none as Option<number>, fallback)).toBe(20);
      expect(fallback).toHaveBeenCalledTimes(1);

      expect(Option.unwrapOrElse(Option.none, () => 'default')).toBe('default');
    });
  });

  describe('Functional Transformations', () => {
    it('map() should transform inner values', () => {
      expect(Option.unwrap(Option.map(Option.some(3), (n: number) => n * n))).toBe(9);
      expect(Option.map(Option.none, (n: number) => n * n)).toBe(Option.none);
    });

    it('andThen() should chain nested Options', () => {
      const getLength = (s: string) => Option.some(s.length);
      expect(Option.unwrap(Option.andThen(Option.some('hello'), getLength))).toBe(5);
      expect(Option.andThen(Option.none, (s: string) => Option.some(s))).toBe(Option.none);
    });

    it('filter() should drop values based on predicate', () => {
      expect(Option.isSome(Option.filter(Option.some(10), (n) => n > 0))).toBe(true);
      expect(Option.isNone(Option.filter(Option.some(-5), (n) => n > 0))).toBe(true);
    });
  });

  describe('Equality & Interoperability', () => {
    it('should convert to nullable/undefined', () => {
      expect(Option.toNullable(Option.some(1))).toBe(1);
      expect(Option.toNullable(Option.none)).toBe(null);
      expect(Option.toUndefined(Option.some(1))).toBe(1);
      expect(Option.toUndefined(Option.none)).toBe(undefined);
    });

    it('equals() should perform deep equality check', () => {
      expect(Option.equals(Option.some(42), Option.some(42))).toBe(true);
      expect(Option.equals(Option.some(42), Option.some(43))).toBe(false);
      expect(Option.equals(Option.some(42), Option.none)).toBe(false);
      expect(Option.equals(Option.none, Option.none)).toBe(true);
    });

    it('match() should execute the correct branch', () => {
      const matcher = { some: (v: number) => v * 2, none: () => -1 };
      expect(Option.match(Option.some(42), matcher)).toBe(84);
      expect(Option.match(Option.none, matcher)).toBe(-1);
    });
  });

  describe('Algebraic Laws', () => {
    const f = (x: number) => x * 2;
    const g = (x: number) => x.toString();

    it('Functor Identity', () => {
      expect(
        Option.equals(
          Option.map(Option.some(42), (x: number) => x),
          Option.some(42)
        )
      ).toBe(true);
      expect(
        Option.equals(
          Option.map(Option.none, (x: unknown) => x),
          Option.none
        )
      ).toBe(true);
    });

    it('Functor Composition', () => {
      const some = Option.some(10);
      const res1 = Option.map(Option.map(some, f), g);
      const res2 = Option.map(some, (x: number) => g(f(x)));
      expect(Option.equals(res1, res2)).toBe(true);
    });
  });
});
