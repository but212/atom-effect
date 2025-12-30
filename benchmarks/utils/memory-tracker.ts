/**
 * @fileoverview memory usage tracking utility
 */

export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  timestamp: number;
}

export interface MemoryDiff {
  heapUsedDiff: number;
  heapTotalDiff: number;
  externalDiff: number;
  rssDiff: number;
  duration: number;
}

/**
 * memory usage tracking class
 */
export class MemoryTracker {
  private snapshots: MemorySnapshot[] = [];

  /**
   * create memory snapshot
   */
  snapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      timestamp: Date.now(),
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * calculate difference between two snapshots
   */
  diff(before: MemorySnapshot, after: MemorySnapshot): MemoryDiff {
    return {
      heapUsedDiff: after.heapUsed - before.heapUsed,
      heapTotalDiff: after.heapTotal - before.heapTotal,
      externalDiff: after.external - before.external,
      rssDiff: after.rss - before.rss,
      duration: after.timestamp - before.timestamp,
    };
  }

  /**
   * return the difference between the last two snapshots
   */
  lastDiff(): MemoryDiff | null {
    if (this.snapshots.length < 2) return null;
    const before = this.snapshots[this.snapshots.length - 2];
    const after = this.snapshots[this.snapshots.length - 1];
    return this.diff(before, after);
  }

  /**
   * return all snapshots
   */
  getSnapshots(): MemorySnapshot[] {
    return this.snapshots;
  }

  /**
   * reset snapshots
   */
  reset(): void {
    this.snapshots = [];
  }

  /**
   * convert memory usage to human-readable format
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = bytes / k ** i;
    const sign = bytes < 0 ? '-' : '';
    return `${sign}${value.toFixed(2)} ${sizes[i]}`;
  }

  /**
   * print memory diff
   */
  printDiff(diff: MemoryDiff): void {
    console.log('\nMemory Usage:');
    console.log('='.repeat(80));
    console.log(`Heap Used:  ${MemoryTracker.formatBytes(diff.heapUsedDiff)}`);
    console.log(`Heap Total: ${MemoryTracker.formatBytes(diff.heapTotalDiff)}`);
    console.log(`External:   ${MemoryTracker.formatBytes(diff.externalDiff)}`);
    console.log(`RSS:        ${MemoryTracker.formatBytes(diff.rssDiff)}`);
    console.log(`Duration:   ${diff.duration}ms`);
  }

  /**
   * print memory snapshot
   */
  printSnapshot(snapshot: MemorySnapshot): void {
    console.log('\nMemory Snapshot:');
    console.log('='.repeat(80));
    console.log(`Heap Used:  ${MemoryTracker.formatBytes(snapshot.heapUsed)}`);
    console.log(`Heap Total: ${MemoryTracker.formatBytes(snapshot.heapTotal)}`);
    console.log(`External:   ${MemoryTracker.formatBytes(snapshot.external)}`);
    console.log(`RSS:        ${MemoryTracker.formatBytes(snapshot.rss)}`);
  }
}

/**
 * measure memory usage before and after function execution
 */
export async function measureMemory<T>(
  fn: () => T | Promise<T>,
  warmup = true
): Promise<{ result: T; memory: MemoryDiff }> {
  const tracker = new MemoryTracker();

  // warmup
  if (warmup) {
    await Promise.resolve(fn());
    global.gc?.();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // measure
  tracker.snapshot();
  const result = await Promise.resolve(fn());
  tracker.snapshot();

  const memory = tracker.lastDiff()!;
  return { result, memory };
}

/**
 * force GC execution (--expose-gc flag required)
 */
export function forceGC(): void {
  if (global.gc) {
    global.gc();
  } else {
    console.warn('GC not available. Run with --expose-gc flag');
  }
}
