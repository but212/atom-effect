/**
 * @fileoverview Symbol Branding Tests
 * @description Verifies that core primitives carry the correct brand symbol and bitwise flags.
 */

import { describe, expect, it } from 'vitest';
import { atom, computed, effect } from '@/index';
import { BRAND, BrandFlags } from '@/symbols';
import { isAtom, isComputed, isEffect, isWritable } from '@/utils/type-guards';

interface Branded {
  [BRAND]?: number;
}

describe('Core Symbols & Branding (Bitwise)', () => {
  describe('Symbol Identity', () => {
    it('uses Symbol.for to ensure stability across realms/versions', () => {
      expect(BRAND).toBe(Symbol.for('atom-effect/brand'));
    });

    it('defines distinct bitwise flags for each brand', () => {
      const flags = [BrandFlags.Atom, BrandFlags.Writable, BrandFlags.Computed, BrandFlags.Effect];
      const uniqueFlags = new Set(flags);
      expect(uniqueFlags.size).toBe(flags.length);

      // Ensure no overlapping bits
      let combined = 0;
      for (const flag of flags) {
        expect(combined & flag).toBe(0);
        combined |= flag;
      }
    });
  });

  describe('Primitive Branding', () => {
    it('stamps writable atoms with Atom and Writable flags', () => {
      const a = atom(42);
      const flags = (a as unknown as Branded)[BRAND];

      expect(flags! & BrandFlags.Atom).toBeTruthy();
      expect(flags! & BrandFlags.Writable).toBeTruthy();
      expect(flags! & BrandFlags.Computed).toBeFalsy();
      expect(flags! & BrandFlags.Effect).toBeFalsy();

      expect(isAtom(a)).toBe(true);
      expect(isWritable(a)).toBe(true);
      expect(isComputed(a)).toBe(false);
    });

    it('stamps computed atoms with Atom and Computed flags', () => {
      const c = computed(() => 100);
      const flags = (c as unknown as Branded)[BRAND];

      expect(flags! & BrandFlags.Atom).toBeTruthy();
      expect(flags! & BrandFlags.Computed).toBeTruthy();
      expect(flags! & BrandFlags.Writable).toBeFalsy();
      expect(flags! & BrandFlags.Effect).toBeFalsy();

      expect(isAtom(c)).toBe(true);
      expect(isComputed(c)).toBe(true);
      expect(isWritable(c)).toBe(false);
    });

    it('stamps effects with Effect flag only', () => {
      const e = effect(() => {});
      const flags = (e as unknown as Branded)[BRAND];

      expect(flags! & BrandFlags.Effect).toBeTruthy();
      expect(flags! & BrandFlags.Atom).toBeFalsy();
      expect(flags! & BrandFlags.Writable).toBeFalsy();
      expect(flags! & BrandFlags.Computed).toBeFalsy();

      expect(isEffect(e)).toBe(true);
      expect(isAtom(e)).toBe(false);

      e.dispose();
    });
  });

  describe('Duck-typing Prevention', () => {
    it('does not identify plain objects as atoms even if they mimic the shape', () => {
      const fakeAtom = {
        value: 1,
        subscribe: () => () => {},
        peek: () => 1,
        subscriberCount: () => 0,
      };

      // Brands should not be present on plain objects
      expect((fakeAtom as unknown as Branded)[BRAND]).toBeUndefined();

      // Type guards should reject them
      expect(isAtom(fakeAtom)).toBe(false);
      expect(isWritable(fakeAtom)).toBe(false);
      expect(isComputed(fakeAtom)).toBe(false);
      expect(isEffect(fakeAtom)).toBe(false);
    });
  });
});
