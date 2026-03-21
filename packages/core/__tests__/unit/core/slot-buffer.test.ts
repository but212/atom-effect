/**
 * @fileoverview SlotBuffer unit tests
 * @description Verifies inline-slot storage, overflow, compaction, and clear/reuse semantics.
 */

import { describe, expect, it } from 'vitest';
import { SlotBuffer } from '@/core/slot-buffer';

describe('SlotBuffer', () => {
  describe('Inline Slot Storage (0-4 items)', () => {
    it('starts empty with size 0', () => {
      const buf = new SlotBuffer<string>();
      expect(buf.size).toBe(0);
    });

    it('stores up to 4 items in inline slots without overflow', () => {
      const buf = new SlotBuffer<string>();
      buf.add('a');
      buf.add('b');
      buf.add('c');
      buf.add('d');

      expect(buf.size).toBe(4);
      expect(buf._s0).toBe('a');
      expect(buf._s1).toBe('b');
      expect(buf._s2).toBe('c');
      expect(buf._s3).toBe('d');
      expect(buf._overflow).toBeNull();
    });

    it('iterates inline slots in order', () => {
      const buf = new SlotBuffer<string>();
      buf.add('x');
      buf.add('y');

      const collected: string[] = [];
      buf.forEach((item) => collected.push(item));
      expect(collected).toEqual(['x', 'y']);
    });
  });

  describe('Overflow to Array', () => {
    it('spills to overflow array on 5th add', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 5; i++) buf.add(i);

      expect(buf.size).toBe(5);
      expect(buf._overflow).not.toBeNull();
      expect(buf._overflow).toHaveLength(1);
      expect(buf._overflow![0]).toBe(4);
    });

    it('forEach visits inline + overflow items', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 7; i++) buf.add(i);

      const collected: number[] = [];
      buf.forEach((item) => collected.push(item));
      expect(collected).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
  });

  describe('Remove (Logical Deletion)', () => {
    it('removes inline slot items by identity', () => {
      const buf = new SlotBuffer<string>();
      buf.add('a');
      buf.add('b');
      buf.add('c');

      expect(buf.remove('b')).toBe(true);
      expect(buf.size).toBe(2);
      expect(buf._s1).toBeNull();

      // forEach skips null
      const collected: string[] = [];
      buf.forEach((item) => collected.push(item));
      expect(collected).toEqual(['a', 'c']);
    });

    it('removes overflow items by identity', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 6; i++) buf.add(i);

      expect(buf.remove(5)).toBe(true);
      expect(buf.size).toBe(5);
    });

    it('returns false for items not in buffer', () => {
      const buf = new SlotBuffer<string>();
      buf.add('a');
      expect(buf.remove('z')).toBe(false);
      expect(buf.size).toBe(1);
    });
  });

  describe('Has', () => {
    it('detects inline items', () => {
      const buf = new SlotBuffer<string>();
      buf.add('a');
      buf.add('b');

      expect(buf.has('a')).toBe(true);
      expect(buf.has('b')).toBe(true);
      expect(buf.has('c')).toBe(false);
    });

    it('detects overflow items', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 8; i++) buf.add(i);

      expect(buf.has(7)).toBe(true);
      expect(buf.has(99)).toBe(false);
    });
  });

  describe('Compact', () => {
    it('removes null gaps from overflow array', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 8; i++) buf.add(i);

      // Remove some overflow items
      buf.remove(5);
      buf.remove(6);
      expect(buf._overflow!.length).toBe(4); // still has gaps

      buf.compact();
      // After compaction, no null gaps, overflow might be shorter
      const collected: number[] = [];
      buf.forEach((item) => collected.push(item));
      expect(collected).toContain(0);
      expect(collected).toContain(7);
      expect(collected).not.toContain(5);
      expect(collected).not.toContain(6);
    });

    it('releases overflow array when all overflow items are removed', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 5; i++) buf.add(i);

      buf.remove(4); // remove the only overflow item
      buf.compact();
      expect(buf._overflow).toBeNull();
    });

    it('is a no-op when there is no overflow', () => {
      const buf = new SlotBuffer<string>();
      buf.add('a');
      buf.compact(); // should not throw
      expect(buf.size).toBe(1);
    });
  });

  describe('Clear and Reuse', () => {
    it('clear() resets count and nulls all slots', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 6; i++) buf.add(i);

      buf.clear();
      expect(buf.size).toBe(0);
      expect(buf._s0).toBeNull();
      expect(buf._s1).toBeNull();
      expect(buf._s2).toBeNull();
      expect(buf._s3).toBeNull();
      expect(buf._overflow).toBeNull();
    });

    it('can be reused after clear()', () => {
      const buf = new SlotBuffer<string>();
      buf.add('old');
      buf.clear();

      buf.add('new');
      expect(buf.size).toBe(1);
      expect(buf._s0).toBe('new');

      const collected: string[] = [];
      buf.forEach((item) => collected.push(item));
      expect(collected).toEqual(['new']);
    });

    it('add() reuses null inline slots after remove()', () => {
      const buf = new SlotBuffer<string>();
      buf.add('a');
      buf.add('b');
      buf.add('c');

      buf.remove('b'); // _s1 becomes null
      buf.add('x'); // should fill _s1

      expect(buf._s1).toBe('x');
      expect(buf.size).toBe(3);
    });
  });

  describe('forEachIndexed', () => {
    it('returns count of executed items', () => {
      const buf = new SlotBuffer<string>();
      buf.add('a');
      buf.add('b');
      buf.add('c');

      const items: string[] = [];
      const count = buf.forEachIndexed((item) => items.push(item));
      expect(count).toBe(3);
      expect(items).toEqual(['a', 'b', 'c']);
    });
  });
});
