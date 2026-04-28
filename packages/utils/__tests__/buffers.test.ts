import { describe, expect, it } from 'vitest';
import { SlotBuffer } from '@/index';

describe('SlotBuffer: Structural Integrity', () => {
  it('should synchronize logical size and physical high-water mark (including holes)', () => {
    const buf = new SlotBuffer<number>();

    // 1. Initial additions and physical boundary expansion
    [0, 1, 2].forEach((i) => buf.push(i));
    expect(buf.length).toBe(3);
    expect(buf.capacity).toBe(3);

    // 2. Removal in the middle: only logical size decreases (hole created)
    buf.remove(1);
    expect(buf.length).toBe(2);
    expect(buf.capacity).toBe(3); // Maintained because index 2 still has data

    // 3. Verify hole reuse
    buf.push(99);
    expect(buf.at(1)).toBe(99);
    expect(buf.length).toBe(3);

    // 4. Iteration: skip holes and execute exactly 'size' times
    buf.remove(99); // [0, null, 2]
    const collected: number[] = [];
    buf.forEach((item: number) => collected.push(item));
    expect(collected).toEqual([0, 2]);
  });

  it('compact() should eliminate holes and reset physical boundaries', () => {
    const buf = new SlotBuffer<number>();
    for (let i = 0; i < 5; i++) buf.push(i);
    buf.remove(1); // [0, null, 2, 3, 4]
    buf.remove(4); // [0, null, 2, 3, null]

    buf.compact();
    expect(buf.length).toBe(3);
    expect(buf.capacity).toBe(3);
    expect([0, 2, 3].map((_, i) => buf.at(i))).toEqual([0, 2, 3]);
    expect(buf.at(3)).toBeNull();
  });

  it('setAt() & truncateFrom() should manage boundary safety', () => {
    const buf = new SlotBuffer<string>();
    buf.setAt(10, 'far');
    expect(buf.length).toBe(1);
    expect(buf.capacity).toBe(11);

    buf.setAt(10, null);
    expect(buf.capacity).toBeLessThan(11);

    buf.truncateFrom(5);
    expect(buf.length).toBe(0);
    expect(buf.capacity).toBe(5);
  });
});
