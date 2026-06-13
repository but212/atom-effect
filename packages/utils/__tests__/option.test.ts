import { describe, expect, it, vi } from 'vitest';
import { isOption, Option } from '@/index';
import { OPTION_SYMBOL } from '../src/symbols';

describe('Option<T>', () => {
  // Shared fixtures: unregistered objects that mimic Option shape but are not valid instances.
  const invalidOptionShape = {
    ok: true,
    value: 42,
    [OPTION_SYMBOL]: true,
  } as Option<number>;

  describe('Factories & Constructors', () => {
    it('Option.some() should wrap any present value', () => {
      expect(Option.unwrap(Option.some(42))).toBe(42);
      expect(Option.unwrap(Option.some(null))).toBe(null);
      expect(Option.unwrap(Option.some(undefined))).toBe(undefined);
    });

    it('Option.none should represent absence', () => {
      expect(Option.none.ok).toBe(false);
      expect(Option.isNone(Option.none)).toBe(true);
      expect(Option.map(Option.none, (x: unknown) => x)).toBe(Option.none);
      expect(Option.filter(Option.none, () => true)).toBe(Option.none);
    });

    it('Option.fromNullable() should normalize nullish values to Option.none', () => {
      expect(Option.fromNullable(null)).toBe(Option.none);
      expect(Option.fromNullable(undefined)).toBe(Option.none);
      expect(Option.fromNullable(0).ok).toBe(true);
    });

    it('Option.fromNullable() should treat NaN as Some(NaN)', () => {
      const opt = Option.fromNullable(NaN);
      expect(Option.isSome(opt)).toBe(true);
      expect(Number.isNaN(Option.unwrap(opt))).toBe(true);
    });

    it('Option.fromPredicate() should return Some of value when predicate evaluates to true', () => {
      const result = Option.fromPredicate(42, (x) => x > 0);
      expect(Option.unwrap(result)).toBe(42);
    });

    it('Option.fromPredicate() should narrow type when predicate is a type guard', () => {
      const isString = (x: unknown): x is string => typeof x === 'string';
      const result = Option.fromPredicate('hello' as unknown, isString);
      expect(Option.unwrap(result)).toBe('hello');
    });

    it('Option.fromPredicate() should return None when predicate evaluates to false', () => {
      const result = Option.fromPredicate(-42, (x) => x > 0);
      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe('Type Guards (isOption, isSome, isNone)', () => {
    it('isOption() should detect valid Option instances via symbol/registry', () => {
      expect(isOption(Option.some(1))).toBe(true);
      expect(isOption(Option.none)).toBe(true);
      expect(isOption({ ok: true })).toBe(false);
    });

    it('isOption() should reject fake Option literals created externally', () => {
      expect(isOption(invalidOptionShape)).toBe(false);
    });

    it('Option.isSome() and Option.isNone() should narrow compiler types', () => {
      const opt: Option<number> = Option.some(42);
      if (Option.isSome(opt)) {
        const val: number = opt.value;
        expect(val).toBe(42);
      }
    });
  });

  describe('Extraction & Fallbacks', () => {
    it('Option.unwrap() should extract the inner value or throw error', () => {
      expect(Option.unwrap(Option.some(10))).toBe(10);
      expect(() => Option.unwrap(Option.none)).toThrow('Option.unwrap() on None');
    });

    it('Option.expect() should extract value or throw with custom message', () => {
      expect(Option.expect(Option.some(42), 'error msg')).toBe(42);
      expect(() => Option.expect(Option.none, 'error msg')).toThrow('error msg');
    });

    it('Option.unwrapOr() should provide fallback defaults', () => {
      expect(Option.unwrapOr(Option.some(10), 20)).toBe(10);
      expect(Option.unwrapOr(Option.none as Option<number>, 20)).toBe(20);
    });

    it('Option.unwrapOrElse() should lazily compute default fallback when none', () => {
      const fallback = vi.fn(() => 20);
      expect(Option.unwrapOrElse(Option.some(10), fallback)).toBe(10);
      expect(fallback).not.toHaveBeenCalled();

      expect(Option.unwrapOrElse(Option.none as Option<number>, fallback)).toBe(20);
      expect(fallback).toHaveBeenCalledTimes(1);

      expect(Option.unwrapOrElse(Option.none, () => 'default')).toBe('default');
    });
  });

  describe('Transformations (map, andThen, filter)', () => {
    describe('map()', () => {
      it('should transform the wrapped value', () => {
        expect(Option.unwrap(Option.map(Option.some(3), (n: number) => n * n))).toBe(9);
        expect(Option.map(Option.none, (n: number) => n * n)).toBe(Option.none);
      });

      it('should preserve the same instance when mapping NaN to NaN', () => {
        const opt = Option.some(NaN);
        const mapped = Option.map(opt, (x) => x);
        expect(mapped).toBe(opt);
      });

      it('should reuse the Option instance when mapping an object if the returned reference is identical', () => {
        const frozenObj = Object.freeze({ count: 1 });
        const opt = Option.some(frozenObj);

        const mapped = Option.map(opt, (obj) => obj);
        expect(mapped).toBe(opt);
      });

      it('should NOT reuse the Option instance when mapping a mutable object if the returned reference is identical', () => {
        const mutableObj = { count: 1 };
        const opt = Option.some(mutableObj);

        const mapped = Option.map(opt, (obj) => {
          obj.count = 2;
          return obj;
        });
        expect(mapped).not.toBe(opt);
      });
    });

    describe('andThen()', () => {
      it('should chain computations returning Options', () => {
        const getLength = (s: string) => Option.some(s.length);
        expect(Option.unwrap(Option.andThen(Option.some('hello'), getLength))).toBe(5);
        expect(Option.andThen(Option.none, (s: string) => Option.some(s))).toBe(Option.none);
      });

      it('should throw an error if the mapper returns an invalid Option', () => {
        const opt = Option.some(42);
        expect(() => Option.andThen(opt, () => invalidOptionShape)).toThrow();
      });
    });

    describe('filter()', () => {
      it('should drop values not matching the predicate', () => {
        expect(Option.isSome(Option.filter(Option.some(10), (n) => n > 0))).toBe(true);
        expect(Option.isNone(Option.filter(Option.some(-5), (n) => n > 0))).toBe(true);
      });
    });
  });

  describe('Control Flow Matcher (match)', () => {
    it('Option.match() should execute the correct branch callbacks', () => {
      const matcher = { some: (v: number) => v * 2, none: () => -1 };
      expect(Option.match(Option.some(42), matcher)).toBe(84);
      expect(Option.match(Option.none, matcher)).toBe(-1);
    });
  });

  describe('Array Operations (all)', () => {
    it('Option.all() should combine an array of Some into a Some of array', () => {
      const result = Option.all([Option.some(1), Option.some(2), Option.some(3)]);
      expect(Option.unwrap(result)).toEqual([1, 2, 3]);
    });

    it('Option.all() should return None if any Option is None', () => {
      const result = Option.all([Option.some(1), Option.none, Option.some(3)]);
      expect(Option.isNone(result)).toBe(true);
    });

    it('Option.all() should return Some of empty array for empty input array', () => {
      const result = Option.all([]);
      expect(Option.unwrap(result)).toEqual([]);
    });
  });

  describe('Equality (equals)', () => {
    it('Option.equals() should perform structural and value checks', () => {
      expect(Option.equals(Option.some(42), Option.some(42))).toBe(true);
      expect(Option.equals(Option.some(42), Option.some(43))).toBe(false);
      expect(Option.equals(Option.some(42), Option.none)).toBe(false);
      expect(Option.equals(Option.none, Option.none)).toBe(true);
    });

    it('Option.equals() should return true for two Some(NaN) options', () => {
      expect(Option.equals(Option.some(NaN), Option.some(NaN))).toBe(true);
    });

    it('Option.equals() should return false for Some(-0) and Some(+0)', () => {
      expect(Option.equals(Option.some(-0), Option.some(+0))).toBe(false);
    });

    it('Option.equals() should return false if either argument is not a valid Option', () => {
      const opt = Option.some(42);
      const nonOpt = { ok: true, value: 42 };

      expect(Option.equals(opt, invalidOptionShape)).toBe(false);
      expect(Option.equals(invalidOptionShape, opt)).toBe(false);
      expect(Option.equals(nonOpt as Option<unknown>, nonOpt as Option<unknown>)).toBe(false);
    });
  });

  describe('Interoperability & Conversions', () => {
    it('should convert to nullable/undefined values', () => {
      expect(Option.toNullable(Option.some(1))).toBe(1);
      expect(Option.toNullable(Option.none)).toBe(null);
      expect(Option.toUndefined(Option.some(1))).toBe(1);
      expect(Option.toUndefined(Option.none)).toBe(undefined);
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
