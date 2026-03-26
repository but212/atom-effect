import { bench, describe } from 'vitest';
import { DependencyLink } from '@/core/dep-tracking';
import { DepSlotBuffer } from '@/internal/dep-slot-buffer';
import type { Dependency } from '@/types';
import { microBenchOptions } from '../utils/setup.js';

// Mock dependency for benchmarking
class MockDep implements Dependency {
  _lastSeenEpoch = 0;
  flags = 0;
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
    'claimExisting 4 items (Inline hit)',
    () => {
      for (let i = 0; i < 4; i++) {
        buf4.claimExisting(deps4[i]!, i);
      }
    },
    microBenchOptions
  );

  bench(
    'claimExisting 16 items (Overflow hit)',
    () => {
      for (let i = 0; i < 16; i++) {
        buf16.claimExisting(deps16[i]!, i);
      }
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
    'seal() + isDirtyFast() - 4 items',
    () => {
      buf4.seal();
      buf4.isDirtyFast();
    },
    microBenchOptions
  );

  bench(
    'seal() + isDirtyFast() - 16 items',
    () => {
      buf16.seal();
      buf16.isDirtyFast();
    },
    microBenchOptions
  );
});

describe('DepSlotBuffer: Mega-node Threshold (Map Fallback)', () => {
  const deps64 = Array.from({ length: 64 }, (_, i) => new MockDep(i, 1));
  const buf64 = new DepSlotBuffer();
  deps64.forEach((d) => buf64.insertNew(buf64.size, new DependencyLink(d, d.version)));

  bench(
    'claimExisting 64 items (Map fallback)',
    () => {
      for (let i = 0; i < 64; i++) {
        buf64.claimExisting(deps64[i]!, i);
      }
    },
    microBenchOptions
  );
});

describe('DepSlotBuffer: Truncation', () => {
  bench(
    'truncateFrom(0) with 16 items',
    () => {
      const buf = new DepSlotBuffer();
      for (let i = 0; i < 16; i++) {
        const d = new MockDep(i, 1);
        buf.insertNew(i, new DependencyLink(d, d.version));
      }
      buf.truncateFrom(0);
    },
    microBenchOptions
  );
});
