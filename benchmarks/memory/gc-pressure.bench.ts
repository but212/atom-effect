/**
 * @fileoverview GC 압력 측정 벤치마크
 */

import { atom, batch, computed } from '../utils/import-lib';
import { forceGC, MemoryTracker } from '../utils/memory-tracker';

/**
 * measure GC pressure
 */
async function measureGCPressure() {
  console.log('\nMeasuring GC Pressure...');
  const tracker = new MemoryTracker();

  const iterations = 100;
  const objectsPerIteration = 1000;

  // initial state
  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  // repeat object creation
  for (let i = 0; i < iterations; i++) {
    const atoms: ReturnType<typeof atom>[] = [];
    for (let j = 0; j < objectsPerIteration; j++) {
      atoms.push(atom(j));
    }

    // remove reference to make it GC target
    atoms.length = 0;

    if (i % 10 === 0) {
      tracker.snapshot();
    }
  }

  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  console.log('\nGC Pressure Analysis:');
  const snapshots = tracker.getSnapshots();
  if (snapshots.length >= 2) {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const diff = tracker.diff(first, last);
    tracker.printDiff(diff);

    console.log(`\nTotal iterations: ${iterations}`);
    console.log(`Objects per iteration: ${objectsPerIteration}`);
    console.log(`Total objects created: ${iterations * objectsPerIteration}`);
  }
}

/**
 * compare GC pressure with batch
 */
async function compareBatchGCPressure() {
  console.log('\nComparing GC Pressure: Batch vs No Batch...');
  const tracker = new MemoryTracker();

  // without batch
  console.log('\nWithout Batch:');
  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  for (let i = 0; i < 100; i++) {
    const atoms = Array.from({ length: 100 }, () => atom(0));
    const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
    atoms.forEach((a, idx) => {
      a.value = idx;
    });
    c.value;
  }

  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  const diff1 = tracker.lastDiff();
  if (diff1) {
    tracker.printDiff(diff1);
  }

  // with batch
  console.log('\nWith Batch:');
  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  for (let i = 0; i < 100; i++) {
    const atoms = Array.from({ length: 100 }, () => atom(0));
    const c = computed(() => atoms.reduce((sum, a) => sum + a.value, 0));
    batch(() => {
      atoms.forEach((a, idx) => {
        a.value = idx;
      });
    });
    c.value;
  }

  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  const diff2 = tracker.lastDiff();
  if (diff2) {
    tracker.printDiff(diff2);
  }

  // compare
  if (diff1 && diff2) {
    console.log('\nComparison:');
    const improvement = ((diff1.heapUsedDiff - diff2.heapUsedDiff) / diff1.heapUsedDiff) * 100;
    console.log(`Heap usage improvement: ${improvement.toFixed(2)}%`);
  }
}

/**
 * run GC pressure benchmark
 */
export async function runGCPressureBenchmark() {
  console.log('\nGC Pressure Benchmark');
  console.log('='.repeat(80));
  console.log('Note: Run with --expose-gc flag for accurate GC testing');
  console.log('='.repeat(80));

  await measureGCPressure();
  await compareBatchGCPressure();

  console.log('\nGC pressure benchmark completed');
}

// directly run
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  runGCPressureBenchmark().catch(console.error);
}
