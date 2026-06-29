import { describe, expect, it } from 'vitest';
import { SlotBuffer } from '@/index';

describe('SlotBuffer', () => {
  describe('Initialization & Reset', () => {
    it('should have length and size of 0 initially', () => {
      const slotBuffer = new SlotBuffer<number>();
      expect(slotBuffer.length).toBe(0);
      expect(slotBuffer.size).toBe(0);
      expect(slotBuffer.at(0)).toBeNull();
    });

    it('clear() should reset state completely', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (const num of [1, 2, 3, 4, 5]) {
        slotBuffer.push(num);
      }
      expect(slotBuffer.size).toBe(5);

      slotBuffer.clear();
      expect(slotBuffer.size).toBe(0);
      expect(slotBuffer.length).toBe(0);
      expect(slotBuffer.at(0)).toBeNull();
      expect(slotBuffer.at(4)).toBeNull();
    });

    it('dispose() should reset state completely', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(1);
      slotBuffer.dispose();
      expect(slotBuffer.size).toBe(0);
      expect(slotBuffer.length).toBe(0);
    });
  });

  describe('Retrieval & Search (at, has)', () => {
    it('at() should retrieve items or return null for empty/out-of-bounds slots', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      slotBuffer.push(20);
      expect(slotBuffer.at(0)).toBe(10);
      expect(slotBuffer.at(1)).toBe(20);
      expect(slotBuffer.at(2)).toBeNull();
    });

    it('has() should correctly identify item existence in fast lane', () => {
      const slotBuffer = new SlotBuffer<string>();
      slotBuffer.push('a');
      slotBuffer.push('b');
      expect(slotBuffer.has('a')).toBe(true);
      expect(slotBuffer.has('b')).toBe(true);
      expect(slotBuffer.has('c')).toBe(false);

      slotBuffer.remove('a');
      expect(slotBuffer.has('a')).toBe(false);
    });

    it('has() should correctly identify item existence in overflow array', () => {
      const slotBuffer = new SlotBuffer<string>();
      slotBuffer.push('a');
      slotBuffer.push('b');
      slotBuffer.push('c');
      slotBuffer.push('d');
      slotBuffer.push('e'); // index 4 (overflow)
      expect(slotBuffer.has('e')).toBe(true);
      expect(slotBuffer.has('f')).toBe(false);
    });

    it('has() should return false on empty buffer', () => {
      const slotBuffer = new SlotBuffer<number>();
      expect(slotBuffer.has(10)).toBe(false);
    });
  });

  describe('Insertion & Hole Reuse (push)', () => {
    it('push() should append items to the tail', () => {
      const slotBuffer = new SlotBuffer<number>();
      const firstIndex = slotBuffer.push(10);
      const secondIndex = slotBuffer.push(20);
      expect(firstIndex).toBe(0);
      expect(secondIndex).toBe(1);
      expect(slotBuffer.length).toBe(2);
      expect(slotBuffer.size).toBe(2);
    });

    it('push() should reuse vacated fast-lane holes correctly', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (const num of [0, 1, 2]) {
        slotBuffer.push(num);
      }
      slotBuffer.remove(1); // Create a hole in the "fast lane" [0, null, 2]
      expect(slotBuffer.size).toBe(2);
      expect(slotBuffer.length).toBe(3);
      expect(slotBuffer.at(1)).toBeNull();

      slotBuffer.push(99); // Reuse the hole [0, 99, 2]
      expect(slotBuffer.at(1)).toBe(99);
      expect(slotBuffer.size).toBe(3);
      expect(slotBuffer.length).toBe(3);
    });

    it('push() should reuse free indices in LIFO order after removals', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 10; i++) {
        slotBuffer.push(i);
      }
      slotBuffer.remove(8);
      slotBuffer.remove(9);

      const firstIndex = slotBuffer.push(99);
      const secondIndex = slotBuffer.push(100);
      expect(firstIndex).toBe(9);
      expect(secondIndex).toBe(8);
    });

    it('push() should not reuse holes when buffer is locked', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      slotBuffer.push(20);
      slotBuffer.remove(10); // Index 0 is a hole

      slotBuffer.lock();
      const pushedIndex = slotBuffer.push(30); // Pushed while locked
      expect(pushedIndex).toBe(2); // Should append to tail (index 2) instead of reusing index 0
      expect(slotBuffer.at(0)).toBeNull();
      expect(slotBuffer.at(2)).toBe(30);

      slotBuffer.unlock();
      const secondIndex = slotBuffer.push(40); // Pushed after unlock
      expect(secondIndex).toBe(0); // Should now reuse index 0
      expect(slotBuffer.at(0)).toBe(40);
    });
  });

  describe('Removal (remove)', () => {
    it('remove() should remove items by identity', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      slotBuffer.push(20);

      const isSuccess = slotBuffer.remove(20);
      expect(isSuccess).toBe(true);
      expect(slotBuffer.at(1)).toBeNull();
    });

    it('remove() should return false on empty buffer', () => {
      const slotBuffer = new SlotBuffer<number>();
      expect(slotBuffer.remove(10)).toBe(false);
    });

    it('remove() should return false for non-existent items (without overflow)', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(1);
      slotBuffer.push(2);
      expect(slotBuffer.remove(99)).toBe(false);
    });

    it('remove() should return false for non-existent items (with overflow)', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 6; i++) {
        slotBuffer.push(i);
      }
      expect(slotBuffer.remove(99)).toBe(false);
    });

    it('remove() should shrink physical capacity when tail items are removed', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(0);
      slotBuffer.push(1);

      slotBuffer.remove(1); // Removed from tail
      expect(slotBuffer.at(1)).toBeNull();
      expect(slotBuffer.length).toBe(1);

      slotBuffer.push(2); // Should occupy index 1
      expect(slotBuffer.at(1)).toBe(2);
    });

    it('remove() should shrink physical capacity when tail overflow items are removed', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 6; i++) {
        slotBuffer.push(i);
      }
      slotBuffer.remove(4); // ov[0] becomes null, i.e. [null, 5]
      slotBuffer.remove(5); // ov[1] becomes null, triggers shrinkPhysicalSizeFrom

      expect(slotBuffer.length).toBe(4);
      expect(slotBuffer.size).toBe(4);
    });
  });

  describe('Manual Indexing (setAt)', () => {
    it('setAt() should allow sparse indexing', () => {
      const slotBuffer = new SlotBuffer<string>();
      slotBuffer.setAt(10, 'far');

      expect(slotBuffer.size).toBe(1);
      expect(slotBuffer.length).toBe(11);
      expect(slotBuffer.at(10)).toBe('far');
      expect(slotBuffer.at(0)).toBeNull();

      slotBuffer.setAt(10, null);
      expect(slotBuffer.size).toBe(0);
      expect(slotBuffer.length).toBe(0);
      expect(slotBuffer.at(10)).toBeNull();
    });

    it('setAt() should create and reuse gaps via setAt(index, null)', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      slotBuffer.push(20);

      slotBuffer.setAt(0, null);

      const index = slotBuffer.push(30);
      expect(index).toBe(0);
    });

    it('setAt() should return early if value is unchanged', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      expect(slotBuffer.at(0)).toBe(10);

      slotBuffer.setAt(0, 10);
      expect(slotBuffer.size).toBe(1);
      expect(slotBuffer.at(0)).toBe(10);
    });

    it('setAt() should replace existing value without changing logical size', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      expect(slotBuffer.size).toBe(1);

      slotBuffer.setAt(0, 20);
      expect(slotBuffer.size).toBe(1);
      expect(slotBuffer.at(0)).toBe(20);
    });
  });

  describe('Truncation (truncateFrom)', () => {
    it('truncateFrom() should truncate items and reset boundaries', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 10; i++) slotBuffer.push(i);

      slotBuffer.truncateFrom(5);
      expect(slotBuffer.size).toBe(5);
      expect(slotBuffer.length).toBe(5);
      expect(slotBuffer.at(4)).toBe(4);
      expect(slotBuffer.at(5)).toBeNull();
      expect(slotBuffer.at(9)).toBeNull();
    });

    it('truncateFrom() should handle holes in the truncated region', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 10; i++) slotBuffer.push(i);

      slotBuffer.remove(7); // index 7 (in overflow) becomes null
      expect(slotBuffer.size).toBe(9);
      expect(slotBuffer.length).toBe(10);

      slotBuffer.truncateFrom(5);
      expect(slotBuffer.size).toBe(5); // elements 0, 1, 2, 3, 4 remain (all non-null, size=5)
      expect(slotBuffer.length).toBe(5);
    });

    it('truncateFrom() should preserve free indices below the truncation index', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      slotBuffer.push(20);
      slotBuffer.push(30);
      slotBuffer.push(40);
      slotBuffer.remove(10); // index 0 is a hole
      slotBuffer.remove(30); // index 2 is a hole

      slotBuffer.truncateFrom(3); // Truncates index 3 (40)
      // Index 0 and 2 are still below 3, so they should be preserved!
      const pushedIndex = slotBuffer.push(50);
      expect(pushedIndex).toBe(2); // Should reuse index 2 (LIFO)
    });

    it('truncateFrom() should return early if index is out of bounds', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      slotBuffer.push(20);
      expect(slotBuffer.length).toBe(2);

      slotBuffer.truncateFrom(10);
      expect(slotBuffer.length).toBe(2);
      expect(slotBuffer.at(0)).toBe(10);
      expect(slotBuffer.at(1)).toBe(20);
    });
  });

  describe('Compaction (compact)', () => {
    it('compact() should eliminate holes and shift items forward', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 5; i++) slotBuffer.push(i); // [0, 1, 2, 3, 4]

      slotBuffer.remove(1); // [0, null, 2, 3, 4]
      slotBuffer.remove(4); // [0, null, 2, 3, null]

      expect(slotBuffer.size).toBe(3);
      expect(slotBuffer.length).toBe(4); // [0, null, 2, 3]

      slotBuffer.compact();

      expect(slotBuffer.size).toBe(3);
      expect(slotBuffer.length).toBe(3);
      expect(slotBuffer.at(0)).toBe(0);
      expect(slotBuffer.at(1)).toBe(2);
      expect(slotBuffer.at(2)).toBe(3);
      expect(slotBuffer.at(3)).toBeNull();
      expect(slotBuffer.at(4)).toBeNull();
    });

    it('compact() should be a no-op if no holes exist', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(1);
      slotBuffer.push(2);

      slotBuffer.compact();
      expect(slotBuffer.at(0)).toBe(1);
      expect(slotBuffer.at(1)).toBe(2);
    });

    it('compact() should correctly compact fast-lane gaps without data corruption', () => {
      const slotBuffer = new SlotBuffer<string>();
      slotBuffer.push('a'); // index 0
      slotBuffer.push('b'); // index 1

      slotBuffer.remove('a'); // s0 becomes null, s1 is 'b'. mask = 0b0010

      slotBuffer.compact();

      expect(slotBuffer.at(0)).toBe('b');
      expect(slotBuffer.size).toBe(1);
      expect(slotBuffer.length).toBe(1);

      const items: string[] = [];
      slotBuffer.forEach((item) => items.push(item));
      expect(items).toEqual(['b']);
      expect(slotBuffer.has('b')).toBe(true);
    });

    it('compact() should clear the buffer completely when compacting a buffer with no items left', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(1);
      slotBuffer.push(2);
      slotBuffer.lock();
      slotBuffer.remove(1);
      slotBuffer.remove(2);
      expect(slotBuffer.size).toBe(0);
      expect(slotBuffer.length).toBe(2);
      slotBuffer.unlock();
      slotBuffer.compact();
      expect(slotBuffer.size).toBe(0);
      expect(slotBuffer.length).toBe(0);
    });

    it('compact() should truncate the overflow array length when elements still remain in overflow', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 8; i++) slotBuffer.push(i);
      slotBuffer.remove(1); // [0, null, 2, 3, 4, 5, 6, 7]
      slotBuffer.compact(); // [0, 2, 3, 4, 5, 6, 7] (7 items)
      expect(slotBuffer.size).toBe(7);
      expect(slotBuffer.length).toBe(7);
      expect(slotBuffer.at(6)).toBe(7);
    });
  });

  describe('Iteration (forEach)', () => {
    it('forEach() should iterate through non-null items in order', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (const num of [0, 1, 2, 3, 4]) {
        slotBuffer.push(num);
      }
      slotBuffer.remove(1);
      slotBuffer.remove(3);

      const collected: number[] = [];
      slotBuffer.forEach((item) => collected.push(item));

      expect(collected).toEqual([0, 2, 4]);
    });

    it('forEach() should traverse non-null items when holes exist in the overflow array', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 6; i++) {
        slotBuffer.push(i);
      }
      slotBuffer.remove(4); // index 4 (overflow) becomes null

      const collected: number[] = [];
      slotBuffer.forEach((item) => collected.push(item));

      expect(collected).toEqual([0, 1, 2, 3, 5]);
    });

    it('forEach() should not pass null to callback when items are removed during iteration', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      slotBuffer.push(20);

      const items: number[] = [];
      slotBuffer.forEach((item) => {
        items.push(item);
        if (item === 10) {
          slotBuffer.remove(20);
        }
      });

      expect(items).toEqual([10]);
    });

    it('forEach() should not corrupt iteration or pass null when compacted during iteration', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      slotBuffer.push(20);
      slotBuffer.push(30);
      slotBuffer.remove(20); // [10, null, 30]

      const items: number[] = [];
      slotBuffer.forEach((item) => {
        items.push(item);
        if (item === 10) {
          slotBuffer.compact();
        }
      });

      expect(items).toEqual([10, 30]);
    });

    it('forEach() should do nothing on empty buffer', () => {
      const slotBuffer = new SlotBuffer<number>();
      let count = 0;
      slotBuffer.forEach(() => {
        count++;
      });
      expect(count).toBe(0);
    });
  });

  describe('Conditional Check (some)', () => {
    it('some() should perform early-exit in fast-lane slots', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 10; i++) slotBuffer.push(i);

      let fastLaneCount = 0;
      const isFastLaneFound = slotBuffer.some((value) => {
        fastLaneCount++;
        return value === 2; // Index 2 (s2)
      });
      expect(isFastLaneFound).toBe(true);
      expect(fastLaneCount).toBe(3); // 0, 1, 2
    });

    it('some() should perform early-exit in overflow array', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 10; i++) slotBuffer.push(i);

      let counter = 0;
      const isFound = slotBuffer.some((value) => {
        counter++;
        return value === 5;
      });

      expect(isFound).toBe(true);
      expect(counter).toBe(6); // 0, 1, 2, 3, 4, 5
    });

    it('some() should return false when element is not found (small buffer)', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(10);
      slotBuffer.push(20);
      expect(slotBuffer.some((value) => value === 99)).toBe(false);
    });

    it('some() should return false when element is not found (large buffer)', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 10; i++) slotBuffer.push(i);
      expect(slotBuffer.some((value) => value === 99)).toBe(false);
    });

    it('some() should return false on empty buffer', () => {
      const slotBuffer = new SlotBuffer<number>();
      expect(slotBuffer.some(() => true)).toBe(false);
    });
  });

  describe('Locking Mechanism', () => {
    it('should defer compaction when locked', () => {
      const slotBuffer = new SlotBuffer<number>();
      for (let i = 0; i < 5; i++) slotBuffer.push(i);
      slotBuffer.remove(1); // [0, null, 2, 3, 4]

      slotBuffer.lock();
      expect(slotBuffer.isLocked).toBe(true);

      slotBuffer.compact(); // Deferred
      expect(slotBuffer.at(1)).toBeNull();
      expect(slotBuffer.size).toBe(4);
      expect(slotBuffer.length).toBe(5);

      slotBuffer.unlock();
      expect(slotBuffer.isLocked).toBe(false);
      expect(slotBuffer.at(1)).toBe(2); // Compacted
      expect(slotBuffer.at(3)).toBe(4);
      expect(slotBuffer.at(4)).toBeNull();
    });

    it('should handle nested locks', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.push(1);
      slotBuffer.remove(1);

      slotBuffer.lock();
      slotBuffer.lock();
      slotBuffer.compact();

      slotBuffer.unlock();
      expect(slotBuffer.isLocked).toBe(true); // Still one lock left

      slotBuffer.unlock();
      expect(slotBuffer.isLocked).toBe(false);
    });

    it('should not allow negative lockCount', () => {
      const slotBuffer = new SlotBuffer<number>();
      slotBuffer.unlock(); // unbalanced unlock

      expect(slotBuffer.isLocked).toBe(false);

      slotBuffer.lock();
      expect(slotBuffer.isLocked).toBe(true);
    });

    it('should return false when calling has() with null or undefined on a buffer with empty slots', () => {
      const slotBuffer = new SlotBuffer<unknown>();
      slotBuffer.push('a');
      slotBuffer.push('b');
      // Buffer has empty slots at index 2 and 3 (which are internally null)
      expect(slotBuffer.has(null)).toBe(false);
      expect(slotBuffer.has(undefined)).toBe(false);
    });

    it('should return false and not corrupt state when calling remove() with null or undefined', () => {
      const slotBuffer = new SlotBuffer<unknown>();
      slotBuffer.push('a');
      slotBuffer.push('b');
      // Index 2 is an empty slot (represented by null internally)

      const previousSize = slotBuffer.size;
      const previousLength = slotBuffer.length;

      // Attempting to remove null/undefined should do nothing
      expect(slotBuffer.remove(null)).toBe(false);
      expect(slotBuffer.remove(undefined)).toBe(false);

      // State should not be corrupted
      expect(slotBuffer.size).toBe(previousSize);
      expect(slotBuffer.length).toBe(previousLength);

      // Push another element to verify free indices is not corrupted
      slotBuffer.push('c'); // Should go to index 2
      expect(slotBuffer.at(2)).toBe('c');
    });
  });
});
