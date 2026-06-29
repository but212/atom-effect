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
      assertType<Equal<ReturnType<typeof JSON.parse>, unknown>>(false);
      assertType<Equal<{ readonly a: number }, { a: number }>>(false);
    });
  });

  describe('Structural Utilities', () => {
    it('UnionToIntersection should convert unions to intersections', () => {
      type UnionType = { a: string } | { b: number };
      type IntersectionType = { a: string } & { b: number };
      assertType<Equal<UnionToIntersection<UnionType>, IntersectionType>>(true);
    });

    it('Prettify should resolve intersections into a single flat object', () => {
      type IntersectedType = { a: string } & { b: number };
      type PrettifiedType = Prettify<IntersectedType>;
      // Even though IntersectedType and PrettifiedType are structurally the same,
      // Prettify makes them a single object type.
      assertType<Equal<PrettifiedType, { a: string; b: number }>>(true);
    });

    it('Merge should flatten unions into a single intersected object type', () => {
      type UnionType = { a: string } | { b: number };
      type MergedType = Merge<UnionType>;
      assertType<Equal<MergedType, { a: string; b: number }>>(true);
    });
  });

  describe('Option and Result Type Narrowing', () => {
    it('should narrow types correctly', () => {
      type OptionType = Option<string | number>;
      assertType<Equal<Extract<OptionType, { ok: true }>['value'], string | number>>(true);

      type Mapped = ReturnType<typeof Result.mapErr<number, string | Error, number>>;
      assertType<Equal<Mapped, Result<number, number>>>(true);
    });
  });
});
