import { assertType, describe, it } from 'vitest';
import type { Option, Result } from '@/index';
import type { Equal, Merge, Prettify, UnionToIntersection } from '@/types';

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

  describe('Option and Result Type Narrowing', () => {
    it('should narrow types correctly', () => {
      type O = Option<string | number>;
      assertType<Equal<Extract<O, { ok: true }>['value'], string | number>>(true);

      type Mapped = ReturnType<typeof Result.mapErr<number, string | Error, number>>;
      assertType<Equal<Mapped, Result<number, number>>>(true);
    });
  });
});
