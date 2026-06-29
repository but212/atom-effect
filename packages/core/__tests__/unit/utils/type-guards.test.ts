/**
 * @fileoverview Symbol Branding Tests
 */

import { describe, expect, it } from 'vitest';
import {
  atom,
  BRAND,
  BrandFlags,
  computed,
  effect,
  isAtom,
  isComputed,
  isEffect,
  isWritable,
} from '@/index';
import { mergeAtomValues, nextSmi } from '@/utils';

describe('Core Symbols & Branding', () => {
  describe('BRAND & BrandFlags', () => {
    it('uses Symbol.for to ensure stability across realms/versions', () => {
      expect(BRAND).toBe(Symbol.for('atom-effect/brand'));
    });

    it('defines distinct bitwise flags for each brand', () => {
      const flags = [BrandFlags.Atom, BrandFlags.Writable, BrandFlags.Computed, BrandFlags.Effect];
      const uniqueFlags = new Set(flags);
      expect(uniqueFlags.size).toBe(flags.length);

      let combined = 0;
      for (const flag of flags) {
        expect(combined & flag).toBe(0);
        combined |= flag;
      }
    });
  });

  describe('isAtom() / isWritable() / isComputed() / isEffect()', () => {
    it('stamps writable atoms with Atom and Writable flags', () => {
      const someAtom = atom(42);
      const flags = (someAtom as { [BRAND]: number })[BRAND];

      expect(flags & BrandFlags.Atom).toBeTruthy();
      expect(flags & BrandFlags.Writable).toBeTruthy();
      expect(flags & BrandFlags.Computed).toBeFalsy();
      expect(flags & BrandFlags.Effect).toBeFalsy();

      expect(isAtom(someAtom)).toBe(true);
      expect(isWritable(someAtom)).toBe(true);
      expect(isComputed(someAtom)).toBe(false);
    });

    it('stamps computed atoms with Atom and Computed flags', () => {
      const computedInstance = computed(() => 100);
      const flags = (computedInstance as { [BRAND]: number })[BRAND];

      expect(flags & BrandFlags.Atom).toBeTruthy();
      expect(flags & BrandFlags.Computed).toBeTruthy();
      expect(flags & BrandFlags.Writable).toBeFalsy();
      expect(flags & BrandFlags.Effect).toBeFalsy();

      expect(isAtom(computedInstance)).toBe(true);
      expect(isComputed(computedInstance)).toBe(true);
      expect(isWritable(computedInstance)).toBe(false);
    });

    it('stamps effects with Effect flag only', () => {
      const effectInstance = effect(() => {});
      const flags = (effectInstance as { [BRAND]: number })[BRAND];

      expect(flags & BrandFlags.Effect).toBeTruthy();
      expect(flags & BrandFlags.Atom).toBeFalsy();
      expect(flags & BrandFlags.Writable).toBeFalsy();
      expect(flags & BrandFlags.Computed).toBeFalsy();

      expect(isEffect(effectInstance)).toBe(true);
      expect(isAtom(effectInstance)).toBe(false);

      effectInstance.dispose();
    });

    it('does not identify plain objects as atoms even if they mimic the shape', () => {
      const fakeAtom = {
        value: 1,
        subscribe: () => () => {},
        peek: () => 1,
        subscriberCount: () => 0,
      };

      expect((fakeAtom as { [BRAND]?: unknown })[BRAND]).toBeUndefined();

      expect(isAtom(fakeAtom)).toBe(false);
      expect(isWritable(fakeAtom)).toBe(false);
      expect(isComputed(fakeAtom)).toBe(false);
      expect(isEffect(fakeAtom)).toBe(false);
    });
  });

  describe('Utility Helpers', () => {
    describe('nextSmi', () => {
      it('should increment SMI values normally', () => {
        expect(nextSmi(1)).toBe(2);
      });

      it('should wrap around to 1 when next reaches 0 (overflow SMI_MAX)', () => {
        // SMI_MAX is 0x3fffffff
        expect(nextSmi(0x3fffffff)).toBe(1);
      });
    });

    describe('mergeAtomValues', () => {
      it('should correctly merge object-based atoms', () => {
        const firstAtom = atom({ x: 1 });
        const secondAtom = atom({ y: 2 });
        const mergedResult = mergeAtomValues([firstAtom, secondAtom]);
        expect(mergedResult).toEqual({ x: 1, y: 2 });
      });

      it('should fall back to indexed properties when merging primitive values', () => {
        const firstAtom = atom(42);
        const secondAtom = atom('hello');
        const mergedResult = mergeAtomValues([firstAtom, secondAtom]);
        expect(mergedResult).toEqual({ '0': 42, '1': 'hello' });
      });

      it('should use peek when peek parameter is true', () => {
        const someAtom = atom({ value: 1 });
        const mergedResult = mergeAtomValues([someAtom], true);
        expect(mergedResult).toEqual({ value: 1 });
      });
    });
  });
});
