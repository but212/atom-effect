/**
 * @fileoverview memory leak detection benchmark
 */

import { atom, computed, effect } from '../utils/import-lib';
import { forceGC, MemoryTracker } from '../utils/memory-tracker';

/**
 * test atom leaks
 */
async function testAtomLeaks() {
  console.log('\nTesting Atom Memory Leaks...');
  const tracker = new MemoryTracker();

  tracker.snapshot();
  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  // repeat atom creation and deletion
  for (let i = 0; i < 10; i++) {
    const atoms: ReturnType<typeof atom>[] = [];
    for (let j = 0; j < 1000; j++) {
      atoms.push(atom(j));
    }
    atoms.length = 0; // 참조 제거
  }

  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  const diff = tracker.lastDiff();
  if (diff) {
    tracker.printDiff(diff);

    if (diff.heapUsedDiff > 1024 * 1024 * 10) {
      console.warn('Possible memory leak detected!');
    } else {
      console.log('No significant memory leak');
    }
  }
}

/**
 * test computed leaks
 */
async function testComputedLeaks() {
  console.log('\nTesting Computed Memory Leaks...');
  const tracker = new MemoryTracker();

  tracker.snapshot();
  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  // repeat computed creation and deletion
  for (let i = 0; i < 10; i++) {
    const a = atom(0);
    const computeds: ReturnType<typeof computed>[] = [];
    for (let j = 0; j < 1000; j++) {
      computeds.push(computed(() => a.value * 2));
    }
    computeds.length = 0;
  }

  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  const diff = tracker.lastDiff();
  if (diff) {
    tracker.printDiff(diff);

    if (diff.heapUsedDiff > 1024 * 1024 * 10) {
      console.warn('Possible memory leak detected!');
    } else {
      console.log('No significant memory leak');
    }
  }
}

/**
 * test effect leaks
 */
async function testEffectLeaks() {
  console.log('\nTesting Effect Memory Leaks...');
  const tracker = new MemoryTracker();

  tracker.snapshot();
  forceGC();
  tracker.snapshot();

  // repeat effect creation and disposal
  for (let i = 0; i < 10; i++) {
    const a = atom(0);
    const effectObjs: ReturnType<typeof effect>[] = [];
    for (let j = 0; j < 1000; j++) {
      const effectObj = effect(() => {
        a.value;
      });
      effectObjs.push(effectObj);
    }
    effectObjs.forEach((e) => e.dispose());
    effectObjs.length = 0;
  }

  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();
  const diff = tracker.lastDiff();
  if (diff) {
    tracker.printDiff(diff);

    if (diff.heapUsedDiff > 1024 * 1024 * 10) {
      console.warn('Possible memory leak detected!');
    } else {
      console.log('No significant memory leak');
    }
  }
}

/**
 * test circular references
 */
async function testCircularReferences() {
  console.log('\nTesting Circular References...');
  const tracker = new MemoryTracker();

  tracker.snapshot();
  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  // create circular structure
  for (let i = 0; i < 100; i++) {
    const a = atom(0);
    const b = computed(() => a.value + 1);
    const c = computed(() => b.value + 1);

    // create complex dependency
    effect(() => {
      a.value;
      b.value;
      c.value;
    });
  }

  forceGC();
  await new Promise((resolve) => setTimeout(resolve, 100));
  tracker.snapshot();

  const diff = tracker.lastDiff();
  if (diff) {
    tracker.printDiff(diff);
  }
}

/**
 * run memory leak detection benchmark
 */
export async function runLeakDetectionBenchmark() {
  console.log('\nMemory Leak Detection Benchmark');
  console.log('='.repeat(80));
  console.log('Note: Run with --expose-gc flag for accurate GC testing');
  console.log('Example: node --expose-gc benchmarks/memory/leak-detection.bench.js');
  console.log('='.repeat(80));

  await testAtomLeaks();
  await testComputedLeaks();
  await testEffectLeaks();
  await testCircularReferences();

  console.log('\nMemory leak detection completed');
}

// directly run
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  runLeakDetectionBenchmark().catch(console.error);
}
