/**
 * @fileoverview Benchmark setup utilities and configuration
 * @description Common utilities for benchmarking with Vitest and Tinybench
 */

import type { BenchOptions } from 'vitest';
import { runtimeDebug } from '../../dist/';

/**
 * Benchmark configuration and diagnostic overrides.
 *
 * Logic: Disable infinite loop detection in benchmarks.
 * Why: Benchmarks intentionally update reactive nodes thousands of times in a
 * single task to measure performance, which would otherwise trigger the
 * infinite loop protection threshold (default: 100).
 */
if (runtimeDebug) {
  runtimeDebug.shouldWarnInfiniteLoop = false;
}

export const REPEATS = 10;

/**
 * Standard benchmark options for micro-benchmarks
 * - Warmup ensures JIT compilation optimizations
 * - Higher iterations for statistical significance
 */
const baseOptions: BenchOptions = {
  throws: true,
};

/**
 * Standard benchmark options for micro-benchmarks
 * - Warmup ensures JIT compilation optimizations
 * - Higher iterations for statistical significance
 */
export const microBenchOptions: BenchOptions = {
  ...baseOptions,
  time: 1500, // 1.5 seconds per benchmark
  iterations: 2000, // Minimum 2000 iterations
  warmupTime: 200, // 200ms warmup for JIT optimization
  warmupIterations: 20,
};

/**
 * Standard benchmark options for macro-benchmarks
 * - Longer time for complex scenarios
 * - Fewer iterations due to higher operation cost
 */
export const macroBenchOptions: BenchOptions = {
  ...baseOptions,
  time: 500, // 0.5 seconds per benchmark
  iterations: 25, // Increased from 10 for better reliability
  warmupTime: 100, // 100ms warmup
  warmupIterations: 3,
};

/**
 * Memory stress test options
 * - Longer duration to observe GC behavior
 * - Fewer iterations to avoid system stress
 */
export const memoryBenchOptions: BenchOptions = {
  ...baseOptions,
  time: 1000, // 1 second per benchmark
  iterations: 20, // Minimum 20 iterations
  warmupTime: 200, // 200ms warmup
  warmupIterations: 2,
};

/**
 * Options for Effect to disable infinite loop detection in benchmarks
 */
export const benchEffectOptions = {
  maxExecutionsPerSecond: Infinity,
  maxExecutionsPerFlush: Infinity,
};

// Warmup disabled so JIT hasn't seen the hot path yet
export const coldBenchOptions: BenchOptions = {
  ...baseOptions,
  time: 2000,
  iterations: 500,
  warmupTime: 0,
  warmupIterations: 0,
};

/**
 * Options for single async microtask benchmarks
 */
export const asyncSingleBenchOptions: BenchOptions = {
  ...baseOptions,
  time: 1000,
  iterations: 500,
  warmupTime: 100,
  warmupIterations: 10,
};

/**
 * Options for parallel async microtask benchmarks
 */
export const asyncParallelBenchOptions: BenchOptions = {
  ...baseOptions,
  time: 1500,
  iterations: 100,
  warmupTime: 200,
  warmupIterations: 5,
};

/**
 * Get current memory usage
 */
export function getMemoryUsage() {
  const { heapUsed, heapTotal, external } = process.memoryUsage();
  return { heapUsed, heapTotal, external };
}

/**
 * Force garbage collection if available
 * Run Node with --expose-gc flag to enable
 */
export function forceGC(): void {
  globalThis.gc?.();
}

export let sink: unknown;

/**
 * Prevents Dead Code Elimination (DCE) by assigning the value to a sink.
 * Use this in benchmarks for values that aren't otherwise consumed.
 */
export function keep(value: unknown): void {
  sink = value;
  if (Date.now() < 0) {
    console.log(sink);
  }
}

export interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
}

export interface DataGridRow {
  id: number;
  name: string;
  department: string;
}

/**
 * Generate todo items for benchmarking
 */
export function generateTodos(count: number): TodoItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    text: `Todo item ${i + 1}`,
    completed: i % 3 === 0,
  }));
}

/**
 * Generate data grid rows for benchmarking
 */
export function generateGridData(rows: number): DataGridRow[] {
  const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
  const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry'];

  return Array.from({ length: rows }, (_, i) => ({
    id: i + 1,
    name: `${names[i % names.length]} ${Math.floor(i / names.length)}`,
    department: departments[i % departments.length] ?? 'Engineering',
  }));
}

export const SIZES = { small: 10, medium: 100, large: 1000 } as const;
export type SizeKey = keyof typeof SIZES;

export function generateTodosBySizeKey(size: SizeKey): TodoItem[] {
  return generateTodos(SIZES[size]);
}

/**
 * Generate a corpus of searchable strings for search-as-you-type benchmarks.
 */
export function generateSearchCorpus(size: SizeKey): string[] {
  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];
  return Array.from({ length: SIZES[size] }, (_, i) => `${words[i % words.length]} item ${i}`);
}
