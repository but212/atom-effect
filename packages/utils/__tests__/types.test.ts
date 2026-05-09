import { assertType, describe, it } from 'vitest';
import type { And, Equal, If, Merge, Not, Or, Prettify, UnionToIntersection } from '@/types';

describe('Type Utilities', () => {
  describe('Logic Primitives', () => {
    it('Equal should detect exact identity', () => {
      assertType<Equal<string, string>>(true);
      assertType<Equal<string, number>>(false);
      assertType<Equal<{ a: number }, { a: number }>>(true);

      // Strict cases
      // biome-ignore lint/suspicious/noExplicitAny: false positive
      assertType<Equal<any, unknown>>(false);
      assertType<Equal<{ readonly a: number }, { a: number }>>(false);
    });

    it('If should branch correctly', () => {
      assertType<Equal<If<true, string, number>, string>>(true);
      assertType<Equal<If<false, string, number>, number>>(true);
    });

    it('Boolean operators (Not, And, Or)', () => {
      assertType<Equal<Not<true>, false>>(true);
      assertType<Equal<Not<false>, true>>(true);

      assertType<Equal<And<true, true>, true>>(true);
      assertType<Equal<And<true, false>, false>>(true);
      assertType<Equal<And<false, true>, false>>(true);
      assertType<Equal<And<false, false>, false>>(true);

      assertType<Equal<Or<true, true>, true>>(true);
      assertType<Equal<Or<true, false>, true>>(true);
      assertType<Equal<Or<false, true>, true>>(true);
      assertType<Equal<Or<false, false>, false>>(true);
    });
  });

  describe('Structural Utilities', () => {
    it('UnionToIntersection should convert unions to intersections', () => {
      type U = { a: string } | { b: number };
      type I = { a: string } & { b: number };
      assertType<Equal<UnionToIntersection<U>, I>>(true);
    });

    it('Prettify should resolve intersections into a single flat object', () => {
      type T = { a: string } & { b: number };
      type P = Prettify<T>;
      // Even though T and P are structurally the same,
      // Prettify makes them a single object type.
      assertType<Equal<P, { a: string; b: number }>>(true);
    });

    it('Merge should flatten unions into a single intersected object type', () => {
      type U = { a: string } | { b: number };
      type M = Merge<U>;
      assertType<Equal<M, { a: string; b: number }>>(true);
    });
  });
});
