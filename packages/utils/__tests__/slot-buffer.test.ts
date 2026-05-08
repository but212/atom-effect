import { describe, expect, it } from 'vitest';
import { SlotBuffer } from '@/index';

describe('SlotBuffer', () => {
  describe('Basic Operations', () => {
    it('should manage basic insertion and access', () => {
      const buf = new SlotBuffer<number>();

      expect(buf.length).toBe(0);
      expect(buf.size).toBe(0);
      expect(buf.at(0)).toBeNull();

      buf.push(10);
      buf.push(20);

      expect(buf.length).toBe(2);
      expect(buf.size).toBe(2);
      expect(buf.at(0)).toBe(10);
      expect(buf.at(1)).toBe(20);
      expect(buf.at(2)).toBeNull();
    });

    it('should correctly identify item existence with has()', () => {
      const buf = new SlotBuffer<string>();
      buf.push('a');
      buf.push('b');

      expect(buf.has('a')).toBe(true);
      expect(buf.has('b')).toBe(true);
      expect(buf.has('c')).toBe(false);

      buf.remove('a');
      expect(buf.has('a')).toBe(false);
    });

    it('should reset state on clear()', () => {
      const buf = new SlotBuffer<number>();
      [1, 2, 3, 4, 5].forEach((i) => buf.push(i));

      expect(buf.size).toBe(5);

      buf.clear();

      expect(buf.size).toBe(0);
      expect(buf.length).toBe(0);
      expect(buf.at(0)).toBeNull();
      expect(buf.at(4)).toBeNull();
    });
  });

  describe('Structural Integrity & Hole Management', () => {
    it('should create and reuse holes correctly', () => {
      const buf = new SlotBuffer<number>();
      [0, 1, 2].forEach((i) => buf.push(i));

      // Create a hole in the "fast lane"
      buf.remove(1); // [0, null, 2]
      expect(buf.size).toBe(2);
      expect(buf.length).toBe(3);
      expect(buf.at(1)).toBeNull();
      expect(buf.at(2)).toBe(2);

      // Reuse the hole
      buf.push(99); // [0, 99, 2]
      expect(buf.at(1)).toBe(99);
      expect(buf.size).toBe(3);
      expect(buf.length).toBe(3);
    });

    it('should manage physical boundaries during removal', () => {
      const buf = new SlotBuffer<number>();
      buf.push(0);
      buf.push(1);

      buf.remove(1); // Removed from tail
      expect(buf.at(1)).toBeNull();

      buf.push(2); // Should occupy index 1
      expect(buf.at(1)).toBe(2);
    });
  });

  describe('Manual Indexing & Truncation', () => {
    it('should allow sparse indexing with setAt()', () => {
      const buf = new SlotBuffer<string>();
      buf.setAt(10, 'far');

      expect(buf.size).toBe(1);
      expect(buf.length).toBe(11);
      expect(buf.at(10)).toBe('far');
      expect(buf.at(0)).toBeNull();

      buf.setAt(10, null);
      expect(buf.size).toBe(0);
      expect(buf.length).toBe(0);
      expect(buf.at(10)).toBeNull();
    });

    it('should truncate items and reset boundaries with truncateFrom()', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 10; i++) buf.push(i);

      buf.truncateFrom(5);
      expect(buf.size).toBe(5);
      expect(buf.length).toBe(5);
      expect(buf.at(4)).toBe(4);
      expect(buf.at(5)).toBeNull();
      expect(buf.at(9)).toBeNull();
    });
  });

  describe('Compaction', () => {
    it('should eliminate holes and shift items forward', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 5; i++) buf.push(i); // [0, 1, 2, 3, 4]

      buf.remove(1); // [0, null, 2, 3, 4]
      buf.remove(4); // [0, null, 2, 3, null]

      expect(buf.size).toBe(3);
      expect(buf.length).toBe(4); // [0, null, 2, 3]

      buf.compact();

      expect(buf.size).toBe(3);
      expect(buf.length).toBe(3);
      expect(buf.at(0)).toBe(0);
      expect(buf.at(1)).toBe(2);
      expect(buf.at(2)).toBe(3);
      expect(buf.at(3)).toBeNull();
      expect(buf.at(4)).toBeNull();
    });

    it('should be a no-op if no holes exist', () => {
      const buf = new SlotBuffer<number>();
      buf.push(1);
      buf.push(2);

      buf.compact();
      expect(buf.at(0)).toBe(1);
      expect(buf.at(1)).toBe(2);
    });
  });

  describe('Search & Iteration', () => {
    it('should iterate through non-null items with forEach()', () => {
      const buf = new SlotBuffer<number>();
      [0, 1, 2, 3, 4].forEach((i) => buf.push(i));
      buf.remove(1);
      buf.remove(3);

      const collected: number[] = [];
      buf.forEach((item) => collected.push(item));

      expect(collected).toEqual([0, 2, 4]);
    });

    it('should perform early-exit with some()', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 10; i++) buf.push(i);

      let count = 0;
      const found = buf.some((val) => {
        count++;
        return val === 5;
      });

      expect(found).toBe(true);
      expect(count).toBe(6); // 0, 1, 2, 3, 4, 5

      expect(buf.some((val) => val === 99)).toBe(false);
    });
  });

  describe('Locking Mechanism', () => {
    it('should defer compaction when locked', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 5; i++) buf.push(i);
      buf.remove(1); // [0, null, 2, 3, 4]

      buf.lock();
      expect(buf.isLocked).toBe(true);

      buf.compact(); // Deferred
      expect(buf.at(1)).toBeNull();
      expect(buf.size).toBe(4);
      expect(buf.length).toBe(5);

      buf.unlock();
      expect(buf.isLocked).toBe(false);
      expect(buf.at(1)).toBe(2); // Compacted
      expect(buf.at(3)).toBe(4);
      expect(buf.at(4)).toBeNull();
    });

    it('should handle nested locks', () => {
      const buf = new SlotBuffer<number>();
      buf.push(1);
      buf.remove(1);

      buf.lock();
      buf.lock();
      buf.compact();

      buf.unlock();
      expect(buf.isLocked).toBe(true); // Still one lock left

      buf.unlock();
      expect(buf.isLocked).toBe(false);
    });
  });
});
