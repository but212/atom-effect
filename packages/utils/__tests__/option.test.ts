import { describe, expect, it, vi } from 'vitest';
import {
  andThen,
  equals,
  filter,
  fromNullable,
  isNone,
  isOption,
  isSome,
  map,
  match,
  None,
  type Option,
  Some,
  toNullable,
  toUndefined,
  unwrap,
  unwrapOr,
  unwrapOrElse,
} from '@/index';

describe('Option<T>', () => {
  describe('Core Creation & Factories', () => {
    it('Some() should encapsulate any value', () => {
      expect(unwrap(Some(42))).toBe(42);
      expect(unwrap(Some(null))).toBe(null);
      expect(unwrap(Some(undefined))).toBe(undefined);
    });

    it('None should represent absence', () => {
      expect(None.ok).toBe(false);
      expect(isNone(None)).toBe(true);
      expect(map(None, (x: unknown) => x)).toBe(None);
      expect(filter(None, () => true)).toBe(None);
    });

    it('fromNullable() should correctly normalize values', () => {
      expect(fromNullable(null)).toBe(None);
      expect(fromNullable(undefined)).toBe(None);
      expect(fromNullable(0).ok).toBe(true);
    });
  });

  describe('Type Identification & Guards', () => {
    it('isOption utility should detect Options via symbol', () => {
      expect(isOption(Some(1))).toBe(true);
      expect(isOption(None)).toBe(true);
      expect(isOption({ ok: true })).toBe(false);
    });

    it('isSome/isNone should act as reliable type guards', () => {
      const opt: Option<number> = Some(42);
      if (isSome(opt)) {
        const val: number = opt.value;
        expect(val).toBe(42);
      }
    });
  });

  describe('Extraction & Fallbacks', () => {
    it('unwrap() should return value or throw', () => {
      expect(unwrap(Some(10))).toBe(10);
      expect(() => unwrap(None)).toThrow('Option.unwrap() on None');
    });

    it('unwrapOr() should provide a default value', () => {
      expect(unwrapOr(Some(10), 20)).toBe(10);
      expect(unwrapOr(None as Option<number>, 20)).toBe(20);
    });

    it('unwrapOrElse() should be lazy and return fallback value when None', () => {
      const fallback = vi.fn(() => 20);
      expect(unwrapOrElse(Some(10), fallback)).toBe(10);
      expect(fallback).not.toHaveBeenCalled();

      expect(unwrapOrElse(None as Option<number>, fallback)).toBe(20);
      expect(fallback).toHaveBeenCalledTimes(1);

      expect(unwrapOrElse(None, () => 'default')).toBe('default');
    });
  });

  describe('Functional Transformations', () => {
    it('map() should transform inner values', () => {
      expect(unwrap(map(Some(3), (n: number) => n * n))).toBe(9);
      expect(map(None, (n: number) => n * n)).toBe(None);
    });

    it('andThen() should chain nested Options', () => {
      const getLength = (s: string) => Some(s.length);
      expect(unwrap(andThen(Some('hello'), getLength))).toBe(5);
      expect(andThen(None, (s: string) => Some(s))).toBe(None);
    });

    it('filter() should drop values based on predicate', () => {
      expect(isSome(filter(Some(10), (n) => n > 0))).toBe(true);
      expect(isNone(filter(Some(-5), (n) => n > 0))).toBe(true);
    });
  });

  describe('Equality & Interoperability', () => {
    it('should convert to nullable/undefined', () => {
      expect(toNullable(Some(1))).toBe(1);
      expect(toNullable(None)).toBe(null);
      expect(toUndefined(Some(1))).toBe(1);
      expect(toUndefined(None)).toBe(undefined);
    });

    it('equals() should perform deep equality check', () => {
      expect(equals(Some(42), Some(42))).toBe(true);
      expect(equals(Some(42), Some(43))).toBe(false);
      expect(equals(Some(42), None)).toBe(false);
      expect(equals(None, None)).toBe(true);
    });

    it('match() should execute the correct branch', () => {
      const matcher = { some: (v: number) => v * 2, none: () => -1 };
      expect(match(Some(42), matcher)).toBe(84);
      expect(match(None, matcher)).toBe(-1);
    });
  });

  describe('Algebraic Laws', () => {
    const f = (x: number) => x * 2;
    const g = (x: number) => x.toString();

    it('Functor Identity', () => {
      expect(
        equals(
          map(Some(42), (x: number) => x),
          Some(42)
        )
      ).toBe(true);
      expect(
        equals(
          map(None, (x: unknown) => x),
          None
        )
      ).toBe(true);
    });

    it('Functor Composition', () => {
      const some = Some(10);
      const res1 = map(map(some, f), g);
      const res2 = map(some, (x: number) => g(f(x)));
      expect(equals(res1, res2)).toBe(true);
    });
  });
});
