import { bench, describe } from 'vitest';
import { SlotBuffer } from '@/core/buffers';
import { keep, microBenchOptions } from '../utils/setup.js';

const REPEATS = 100;

describe('SlotBuffer: Addition (Inline <= 4)', () => {
  bench(
    `add 4 items (SlotBuffer) X${REPEATS}`,
    () => {
      let lastBuf;
      for (let i = 0; i < REPEATS; i++) {
        const buf = new SlotBuffer<number>();
        buf.add(1);
        buf.add(2);
        buf.add(3);
        buf.add(4);
        lastBuf = buf;
      }
      return lastBuf as any;
    },
    microBenchOptions
  );

  bench(
    `push 4 items (Array baseline) X${REPEATS}`,
    () => {
      let lastArr;
      for (let i = 0; i < REPEATS; i++) {
        const arr: number[] = [];
        arr.push(1);
        arr.push(2);
        arr.push(3);
        arr.push(4);
        lastArr = arr;
      }
      return lastArr as any;
    },
    microBenchOptions
  );
});

describe('SlotBuffer: Addition (Overflow > 4)', () => {
  bench(
    `add 16 items (SlotBuffer spill) X${REPEATS}`,
    () => {
      let lastBuf;
      for (let i = 0; i < REPEATS; i++) {
        const buf = new SlotBuffer<number>();
        for (let j = 0; j < 16; j++) {
          buf.add(j);
        }
        lastBuf = buf;
      }
      return lastBuf as any;
    },
    microBenchOptions
  );

  bench(
    `push 16 items (Array baseline) X${REPEATS}`,
    () => {
      let lastArr;
      for (let i = 0; i < REPEATS; i++) {
        const arr: number[] = [];
        for (let j = 0; j < 16; j++) {
          arr.push(j);
        }
        lastArr = arr;
      }
      return lastArr as any;
    },
    microBenchOptions
  );
});

describe('SlotBuffer: Churn (Gap Reuse)', () => {
  bench(
    `remove 8 and add 8 (SlotBuffer O(1) reuse) X${REPEATS}`,
    () => {
      let lastBuf;
      for (let i = 0; i < REPEATS; i++) {
        const buf = new SlotBuffer<number>();
        for (let j = 0; j < 16; j++) buf.add(j);

        // Remove 8
        for (let j = 0; j < 16; j += 2) {
          buf.remove(j);
        }
        // Re-add 8
        for (let j = 0; j < 16; j += 2) {
          buf.add(j);
        }
        lastBuf = buf;
      }
      return lastBuf as any;
    },
    microBenchOptions
  );

  bench(
    `splice 8 and push 8 (Array baseline) X${REPEATS}`,
    () => {
      let lastArr;
      for (let i = 0; i < REPEATS; i++) {
        const arr: number[] = [];
        for (let j = 0; j < 16; j++) arr.push(j);

        // Array removal (accurate baseline by removing even-valued elements)
        for (let j = arr.length - 1; j >= 0; j--) {
          if (arr[j]! % 2 === 0) {
            arr.splice(j, 1);
          }
        }
        for (let j = 0; j < 16; j += 2) {
          arr.push(j);
        }
        lastArr = arr;
      }
      return lastArr as any;
    },
    microBenchOptions
  );
});

describe('SlotBuffer: Iteration', () => {
  const inlineBuf = new SlotBuffer<number>();
  for (let i = 0; i < 4; i++) inlineBuf.add(i);

  const overflowBuf = new SlotBuffer<number>();
  for (let i = 0; i < 16; i++) overflowBuf.add(i);

  const inlineArr = [0, 1, 2, 3];
  const overflowArr = Array.from({ length: 16 }, (_, i) => i);

  bench(
    `forEach 4 items (SlotBuffer) X${REPEATS}`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) {
        sum = 0;
        inlineBuf.forEach((item) => {
          sum += item;
        });
      }
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `forEach 4 items (Array) X${REPEATS}`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) {
        sum = 0;
        inlineArr.forEach((item) => {
          sum += item;
        });
      }
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `forEach 16 items (SlotBuffer) X${REPEATS}`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) {
        sum = 0;
        overflowBuf.forEach((item) => {
          sum += item;
        });
      }
      keep(sum);
    },
    microBenchOptions
  );

  bench(
    `forEach 16 items (Array) X${REPEATS}`,
    () => {
      let sum = 0;
      for (let i = 0; i < REPEATS; i++) {
        sum = 0;
        overflowArr.forEach((item) => {
          sum += item;
        });
      }
      keep(sum);
    },
    microBenchOptions
  );
});

describe('SlotBuffer: Compaction', () => {
  bench(
    `compact 16 items with 8 gaps (SlotBuffer) X${REPEATS}`,
    () => {
      let lastBuf;
      for (let i = 0; i < REPEATS; i++) {
        const buf = new SlotBuffer<number>();
        for (let j = 0; j < 16; j++) buf.add(j);
        for (let j = 0; j < 16; j += 2) buf.remove(j);
        buf.compact();
        lastBuf = buf;
      }
      return lastBuf as any;
    },
    microBenchOptions
  );

  bench(
    `filter nulls (Array baseline) X${REPEATS}`,
    () => {
      let lastArr;
      for (let i = 0; i < REPEATS; i++) {
        let arr: (number | null)[] = [];
        for (let j = 0; j < 16; j++) arr.push(j);
        for (let j = 0; j < 16; j += 2) arr[j] = null;
        arr = arr.filter((x) => x !== null);
        lastArr = arr;
      }
      return lastArr as any;
    },
    microBenchOptions
  );
});
