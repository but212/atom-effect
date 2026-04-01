import { bench, describe } from 'vitest';
import { DependencyLink } from '@/core/dep-tracking';
import { DepSlotBuffer } from '@/internal/dep-slot-buffer';
import type { Dependency } from '@/types';
import { microBenchOptions } from '../utils/setup.js';

const REPEATS = 100;

// Mock dependency for benchmarking
class MockDep implements Dependency {
  _lastSeenEpoch = 0;
  flags = 0;
  isComputed = false;
  hasError = false;
  constructor(
    public id: number,
    public version: number
  ) {}
  subscribe() {
    return () => {};
  }
}

describe('DepSlotBuffer: Claiming (Cache Hits)', () => {
  const deps4 = Array.from({ length: 4 }, (_, i) => new MockDep(i, 1));
  const buf4 = new DepSlotBuffer();
  deps4.forEach((d) => buf4.insertNew(buf4.size, new DependencyLink(d, d.version)));

  const deps16 = Array.from({ length: 16 }, (_, i) => new MockDep(i, 1));
  const buf16 = new DepSlotBuffer();
  deps16.forEach((d) => buf16.insertNew(buf16.size, new DependencyLink(d, d.version)));

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

describe('DepSlotBuffer: Hashing (seal vs isDirty)', () => {
  const deps4 = Array.from({ length: 4 }, (_, i) => new MockDep(i, 1));
  const buf4 = new DepSlotBuffer();
  deps4.forEach((d) => buf4.insertNew(buf4.size, new DependencyLink(d, d.version)));
  buf4.seal();

  const deps16 = Array.from({ length: 16 }, (_, i) => new MockDep(i, 1));
  const buf16 = new DepSlotBuffer();
  deps16.forEach((d) => buf16.insertNew(buf16.size, new DependencyLink(d, d.version)));
  buf16.seal();

  bench(
    `seal() + isDirtyFast() - 4 items X${REPEATS}`,
    () => {
      let lastRes;
      for (let i = 0; i < REPEATS; i++) {
        buf4.seal();
        lastRes = buf4.isDirtyFast();
      }
      return lastRes as any;
    },
    microBenchOptions
  );

  bench(
    `seal() + isDirtyFast() - 16 items X${REPEATS}`,
    () => {
      let lastRes;
      for (let i = 0; i < REPEATS; i++) {
        buf16.seal();
        lastRes = buf16.isDirtyFast();
      }
      return lastRes as any;
    },
    microBenchOptions
  );
});

describe('DepSlotBuffer: Mega-node Threshold (Map Fallback)', () => {
  const deps64 = Array.from({ length: 64 }, (_, i) => new MockDep(i, 1));
  const buf64 = new DepSlotBuffer();
  deps64.forEach((d) => buf64.insertNew(buf64.size, new DependencyLink(d, d.version)));

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
