import { bench, describe } from 'vitest';
import { DepSlotBuffer, SlotBuffer } from '@/core/buffers';
import { DependencyLink } from '@/core/tracking';
import type { Dependency } from '@/types';
import { keep, microBenchOptions } from '../utils/setup.js';

const REPEATS = 100;

describe('SlotBuffer: Addition (Inline <= 4)', () => {
  bench(
    `push 4 items (SlotBuffer) X${REPEATS}`,
    () => {
      let lastBuf;
      for (let i = 0; i < REPEATS; i++) {
        const buf = new SlotBuffer<number>();
        buf.push(1);
        buf.push(2);
        buf.push(3);
        buf.push(4);
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
          buf.push(j);
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
        for (let j = 0; j < 16; j++) buf.push(j);

        // Remove 8
        for (let j = 0; j < 16; j += 2) {
          buf.remove(j);
        }
        // Re-add 8
        for (let j = 0; j < 16; j += 2) {
          buf.push(j);
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
  for (let i = 0; i < 4; i++) inlineBuf.push(i);

  const overflowBuf = new SlotBuffer<number>();
  for (let i = 0; i < 16; i++) overflowBuf.push(i);

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
        for (let j = 0; j < 16; j++) buf.push(j);
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

// Mock dependency for benchmarking
class MockDep implements Dependency {
  _lastSeenEpoch = 0;
  flags = 0;
  isComputed = false;
  hasError = false;
  value = undefined;
  constructor(
    public id: number,
    public version: number
  ) {}
  subscribe() {
    return () => {};
  }
  peek() {
    return this.value;
  }
}

describe('DepSlotBuffer: Claiming (Cache Hits)', () => {
  const deps4 = Array.from({ length: 4 }, (_, i) => new MockDep(i, 1));
  const buf4 = new DepSlotBuffer();
  deps4.forEach((d) => buf4.insertNew(buf4.length, new DependencyLink(d, d.version)));

  const deps16 = Array.from({ length: 16 }, (_, i) => new MockDep(i, 1));
  const buf16 = new DepSlotBuffer();
  deps16.forEach((d) => buf16.insertNew(buf16.length, new DependencyLink(d, d.version)));

  bench(
    `claimExisting 4 items (Inline hit) X${REPEATS}`,
    () => {
      let lastRes;
      for (let i = 0; i < REPEATS; i++) {
        for (let j = 0; j < 4; j++) {
          lastRes = buf4.claimExisting(deps4[j]!, j);
        }
      }
      return lastRes as any;
    },
    microBenchOptions
  );

  bench(
    `claimExisting 16 items (Overflow hit) X${REPEATS}`,
    () => {
      let lastRes;
      for (let i = 0; i < REPEATS; i++) {
        for (let j = 0; j < 16; j++) {
          lastRes = buf16.claimExisting(deps16[j]!, j);
        }
      }
      return lastRes as any;
    },
    microBenchOptions
  );
});

describe('DepSlotBuffer: Mega-node Threshold (Map Fallback)', () => {
  const deps64 = Array.from({ length: 64 }, (_, i) => new MockDep(i, 1));
  const buf64 = new DepSlotBuffer();
  deps64.forEach((d) => buf64.insertNew(buf64.length, new DependencyLink(d, d.version)));

  bench(
    `claimExisting 64 items (Map fallback) X${REPEATS}`,
    () => {
      let lastRes;
      for (let i = 0; i < REPEATS; i++) {
        for (let j = 0; j < 64; j++) {
          lastRes = buf64.claimExisting(deps64[j]!, j);
        }
      }
      return lastRes as any;
    },
    microBenchOptions
  );
});

describe('DepSlotBuffer: Truncation', () => {
  bench(
    `truncateFrom(0) with 16 items X${REPEATS}`,
    () => {
      let lastBuf;
      for (let i = 0; i < REPEATS; i++) {
        const buf = new DepSlotBuffer();
        for (let j = 0; j < 16; j++) {
          const d = new MockDep(j, 1);
          buf.insertNew(j, new DependencyLink(d, d.version));
        }
        buf.truncateFrom(0);
        lastBuf = buf;
      }
      return lastBuf as any;
    },
    microBenchOptions
  );
});
