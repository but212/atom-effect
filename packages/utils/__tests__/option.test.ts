import { describe, expect, it, vi } from 'vitest';
import { isOption, Option } from '@/index';
import { OPTION_SYMBOL } from '../src/symbols';

describe('Option<T>', () => {
  describe('Core Factories', () => {
    it('some() wraps any present value', () => {
      expect(Option.unwrap(Option.some(42))).toBe(42);
      expect(Option.unwrap(Option.some(null))).toBe(null);
      expect(Option.unwrap(Option.some(undefined))).toBe(undefined);
    });

    it('none represents absence', () => {
      expect(Option.none.ok).toBe(false);
      expect(Option.isNone(Option.none)).toBe(true);
      expect(Option.map(Option.none, (x: unknown) => x)).toBe(Option.none);
      expect(Option.filter(Option.none, () => true)).toBe(Option.none);
    });

    it('fromNullable() normalizes nullish values to none', () => {
      expect(Option.fromNullable(null)).toBe(Option.none);
      expect(Option.fromNullable(undefined)).toBe(Option.none);
      expect(Option.fromNullable(0).ok).toBe(true);
    });
  });

  describe('Type Guards', () => {
    it('isOption utility detects valid Option instances via symbol/registry', () => {
      expect(isOption(Option.some(1))).toBe(true);
      expect(isOption(Option.none)).toBe(true);
      expect(isOption({ ok: true })).toBe(false);
    });

    it('isSome/isNone act as reliable compiler type guards', () => {
      const opt: Option<number> = Option.some(42);
      if (Option.isSome(opt)) {
        const val: number = opt.value;
        expect(val).toBe(42);
      }
    });
  });

  describe('Extraction & Fallbacks', () => {
    it('unwrap() extracts the inner value or throws error', () => {
      expect(Option.unwrap(Option.some(10))).toBe(10);
      expect(() => Option.unwrap(Option.none)).toThrow('Option.unwrap() on None');
    });

    it('unwrapOr() provides fallback defaults', () => {
      expect(Option.unwrapOr(Option.some(10), 20)).toBe(10);
      expect(Option.unwrapOr(Option.none as Option<number>, 20)).toBe(20);
    });

    it('unwrapOrElse() lazily computes default fallback when none', () => {
      const fallback = vi.fn(() => 20);
      expect(Option.unwrapOrElse(Option.some(10), fallback)).toBe(10);
      expect(fallback).not.toHaveBeenCalled();

      expect(Option.unwrapOrElse(Option.none as Option<number>, fallback)).toBe(20);
      expect(fallback).toHaveBeenCalledTimes(1);

      expect(Option.unwrapOrElse(Option.none, () => 'default')).toBe('default');
    });
  });

  describe('Functional Transformations', () => {
    it('map() transforms the wrapped value', () => {
      expect(Option.unwrap(Option.map(Option.some(3), (n: number) => n * n))).toBe(9);
      expect(Option.map(Option.none, (n: number) => n * n)).toBe(Option.none);
    });

    it('map() preserves the same instance when mapping NaN to NaN', () => {
      const opt = Option.some(NaN);
      const mapped = Option.map(opt, (x) => x);
      expect(mapped).toBe(opt);
    });

    it('andThen() chains computations returning Options', () => {
      const getLength = (s: string) => Option.some(s.length);
      expect(Option.unwrap(Option.andThen(Option.some('hello'), getLength))).toBe(5);
      expect(Option.andThen(Option.none, (s: string) => Option.some(s))).toBe(Option.none);
    });

    it('filter() drops values not matching the predicate', () => {
      expect(Option.isSome(Option.filter(Option.some(10), (n) => n > 0))).toBe(true);
      expect(Option.isNone(Option.filter(Option.some(-5), (n) => n > 0))).toBe(true);
    });
  });

  describe('Interoperability & Conversion', () => {
    it('should convert to nullable/undefined', () => {
      expect(Option.toNullable(Option.some(1))).toBe(1);
      expect(Option.toNullable(Option.none)).toBe(null);
      expect(Option.toUndefined(Option.some(1))).toBe(1);
      expect(Option.toUndefined(Option.none)).toBe(undefined);
    });
  });

  describe('Control Flow Matcher', () => {
    it('match() executes correct branch callbacks', () => {
      const matcher = { some: (v: number) => v * 2, none: () => -1 };
      expect(Option.match(Option.some(42), matcher)).toBe(84);
      expect(Option.match(Option.none, matcher)).toBe(-1);
    });
  });

  describe('Equality & Comparison', () => {
    it('equals() performs structural and value checks', () => {
      expect(Option.equals(Option.some(42), Option.some(42))).toBe(true);
      expect(Option.equals(Option.some(42), Option.some(43))).toBe(false);
      expect(Option.equals(Option.some(42), Option.none)).toBe(false);
      expect(Option.equals(Option.none, Option.none)).toBe(true);
    });

    it('equals() returns true for two Some(NaN) options', () => {
      expect(Option.equals(Option.some(NaN), Option.some(NaN))).toBe(true);
    });

    it('equals() returns false for Some(-0) and Some(+0)', () => {
      expect(Option.equals(Option.some(-0), Option.some(+0))).toBe(false);
    });

    it('equals() rejects shape-alike non-Option objects', () => {
      expect(
        Option.equals(Option.some(42), { ok: true, value: 42 } as unknown as Option<number>)
      ).toBe(false);
      expect(
        Option.equals(Option.none, { ok: false, value: undefined } as unknown as Option<never>)
      ).toBe(false);
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

  describe('Edge Cases & Security Guards', () => {
    it('fromNullable() treats NaN as None', () => {
      // Why: NaN represents mathematically invalid state, normalized as absent.
      expect(Option.fromNullable(NaN)).toBe(Option.none);
    });

    it('isOption rejects fake Option literals created externally', () => {
      // Security: Prevents mock objects bypassing structural matching registry guards.
      const fakeOption = {
        ok: true,
        value: 42,
        [OPTION_SYMBOL]: true,
      };
      expect(isOption(fakeOption)).toBe(false);
    });

    it('equals() evaluates to false for identical non-Option objects', () => {
      // Logic: Non-Option objects must not trigger early return as equal Option states.
      const nonOpt = { ok: true, value: 42 };
      expect(
        Option.equals(nonOpt as unknown as Option<unknown>, nonOpt as unknown as Option<unknown>)
      ).toBe(false);
    });
  });
});
