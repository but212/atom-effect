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

    it('should shrink physical capacity when tail overflow items are removed', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 6; i++) {
        buf.push(i);
      }
      // [0, 1, 2, 3, 4, 5]

      buf.remove(4); // ov[0] becomes null, i.e. [null, 5]
      buf.remove(5); // ov[1] becomes null, triggers shrinkPhysicalSizeFrom

      expect(buf.length).toBe(4);
      expect(buf.size).toBe(4);
    });

    it('should reuse free indices when pushing new items after removals', () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 10; i++) {
        buf.push(i);
      }

      // Remove elements to populate free indices
      buf.remove(8);
      buf.remove(9);

      // Verify free indices are reused in lifo order
      const idx1 = buf.push(99);
      const idx2 = buf.push(100);

      expect(idx1).toBe(9);
      expect(idx2).toBe(8);
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

    it('should reuse free indices when gaps are created via setAt(index, null)', () => {
      const buf = new SlotBuffer<number>();
      buf.push(10);
      buf.push(20);

      buf.setAt(0, null);

      const index = buf.push(30);
      expect(index).toBe(0);
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

    it('should keep free indices below the truncation index', () => {
      const buf = new SlotBuffer<number>();
      buf.push(10);
      buf.push(20);
      buf.push(30);
      buf.push(40);
      buf.remove(10); // index 0 is a hole
      buf.remove(30); // index 2 is a hole

      buf.truncateFrom(3); // truncates index 3 (40)
      // Index 0 and 2 are still below 3, so they should be preserved!
      const idx = buf.push(50);
      expect(idx).toBe(2); // Should reuse index 2 (LIFO)
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

    it('should correctly compact fast-lane gaps without data corruption', () => {
      const buf = new SlotBuffer<string>();
      buf.push('a'); // index 0
      buf.push('b'); // index 1

      buf.remove('a'); // s0 becomes null, s1 is 'b'. mask = 0b0010

      buf.compact();

      expect(buf.at(0)).toBe('b');
      expect(buf.size).toBe(1);
      expect(buf.length).toBe(1);

      const items: string[] = [];
      buf.forEach((item) => items.push(item));
      expect(items).toEqual(['b']);
      expect(buf.has('b')).toBe(true);
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

    it('should not pass null to callback when items are removed during forEach', () => {
      const buf = new SlotBuffer<number>();
      buf.push(10);
      buf.push(20);

      const items: number[] = [];
      buf.forEach((item) => {
        items.push(item);
        if (item === 10) {
          buf.remove(20);
        }
      });

      expect(items).toEqual([10]);
    });

    it('should not corrupt iteration or pass null when compacted during forEach', () => {
      const buf = new SlotBuffer<number>();
      buf.push(10);
      buf.push(20);
      buf.push(30);
      buf.remove(20); // [10, null, 30]

      const items: number[] = [];
      buf.forEach((item) => {
        items.push(item);
        if (item === 10) {
          buf.compact();
        }
      });

      expect(items).toEqual([10, 30]);
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

    it('should not allow negative lockCount', () => {
      const buf = new SlotBuffer<number>();
      buf.unlock(); // unbalanced unlock

      expect(buf.isLocked).toBe(false);

      buf.lock();
      expect(buf.isLocked).toBe(true);
    });
  });
});
