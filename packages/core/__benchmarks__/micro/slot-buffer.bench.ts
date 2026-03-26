import { bench, describe } from 'vitest';
import { SlotBuffer } from '@/internal/slot-buffer';
import { microBenchOptions } from '../utils/setup.js';

describe('SlotBuffer: Creation', () => {
  bench(
    'new SlotBuffer()',
    () => {
      const buf = new SlotBuffer<number>();
      void buf;
    },
    microBenchOptions
  );

  bench(
    'new Array() baseline',
    () => {
      const arr: number[] = [];
      void arr;
    },
    microBenchOptions
  );
});

describe('SlotBuffer: Addition (Inline <= 4)', () => {
  bench(
    'add 4 items (SlotBuffer)',
    () => {
      const buf = new SlotBuffer<number>();
      buf.add(1);
      buf.add(2);
      buf.add(3);
      buf.add(4);
    },
    microBenchOptions
  );

  bench(
    'push 4 items (Array baseline)',
    () => {
      const arr = [];
      arr.push(1);
      arr.push(2);
      arr.push(3);
      arr.push(4);
    },
    microBenchOptions
  );
});

describe('SlotBuffer: Addition (Overflow > 4)', () => {
  bench(
    'add 16 items (SlotBuffer spill)',
    () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 16; i++) {
        buf.add(i);
      }
    },
    microBenchOptions
  );

  bench(
    'push 16 items (Array baseline)',
    () => {
      const arr = [];
      for (let i = 0; i < 16; i++) {
        arr.push(i);
      }
    },
    microBenchOptions
  );
});

describe('SlotBuffer: Churn (Gap Reuse)', () => {
  const buf = new SlotBuffer<number>();
  for (let i = 0; i < 16; i++) buf.add(i);

  const arr: number[] = [];
  for (let i = 0; i < 16; i++) arr.push(i);

  bench(
    'remove 8 and add 8 (SlotBuffer O(1) reuse)',
    () => {
      // Remove even indices (some inline, some overflow)
      for (let i = 0; i < 16; i += 2) {
        buf.remove(i);
      }
      // Re-add them
      for (let i = 0; i < 16; i += 2) {
        buf.add(i);
      }
    },
    microBenchOptions
  );

  bench(
    'splice 8 and push 8 (Array baseline)',
    () => {
      // Array removal is O(N), simulating comparable churn
      for (let i = 0; i < 8; i++) {
        arr.splice(i, 1);
      }
      for (let i = 0; i < 16; i += 2) {
        arr.push(i);
      }
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
    'forEach 4 items (SlotBuffer)',
    () => {
      let sum = 0;
      inlineBuf.forEach((item) => {
        sum += item;
      });
      void sum;
    },
    microBenchOptions
  );

  bench(
    'forEach 4 items (Array)',
    () => {
      let sum = 0;
      inlineArr.forEach((item) => {
        sum += item;
      });
      void sum;
    },
    microBenchOptions
  );

  bench(
    'forEach 16 items (SlotBuffer)',
    () => {
      let sum = 0;
      overflowBuf.forEach((item) => {
        sum += item;
      });
      void sum;
    },
    microBenchOptions
  );

  bench(
    'forEach 16 items (Array)',
    () => {
      let sum = 0;
      overflowArr.forEach((item) => {
        sum += item;
      });
      void sum;
    },
    microBenchOptions
  );
});

describe('SlotBuffer: Compaction', () => {
  bench(
    'compact 16 items with 8 gaps (SlotBuffer)',
    () => {
      const buf = new SlotBuffer<number>();
      for (let i = 0; i < 16; i++) buf.add(i);
      for (let i = 0; i < 16; i += 2) buf.remove(i);
      buf.compact();
    },
    microBenchOptions
  );

  bench(
    'filter nulls (Array baseline equivalent)',
    () => {
      let arr: (number | null)[] = [];
      for (let i = 0; i < 16; i++) arr.push(i);
      for (let i = 0; i < 16; i += 2) arr[i] = null;
      arr = arr.filter((x) => x !== null);
    },
    microBenchOptions
  );
});
