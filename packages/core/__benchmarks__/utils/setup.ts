/**
 * @fileoverview Benchmark setup utilities and configuration
 * @description Common utilities for benchmarking with Vitest and Tinybench
 */

import type { BenchOptions } from 'vitest';

export const REPEATS = 10;

/**
 * Standard benchmark options for micro-benchmarks
 * - Warmup ensures JIT compilation optimizations
 * - Higher iterations for statistical significance
 */
export const microBenchOptions: BenchOptions = {
  time: 1500, // 1.5 seconds per benchmark
  iterations: 2000, // Minimum 2000 iterations
  warmupTime: 200, // 200ms warmup for JIT optimization
  warmupIterations: 20,
  throws: true, // Don't silently ignore errors
};

/**
 * Standard benchmark options for macro-benchmarks
 * - Longer time for complex scenarios
 * - Fewer iterations due to higher operation cost
 */
export const macroBenchOptions: BenchOptions = {
  time: 500, // 0.5 seconds per benchmark
  iterations: 10, // Minimum 10 iterations
  warmupTime: 100, // 100ms warmup
  warmupIterations: 3,
  throws: true,
};

/**
 * Memory stress test options
 * - Longer duration to observe GC behavior
 * - Fewer iterations to avoid system stress
 */
export const memoryBenchOptions: BenchOptions = {
  time: 1000, // 1 second per benchmark
  iterations: 20, // Minimum 20 iterations
  warmupTime: 200, // 200ms warmup
  warmupIterations: 2,
  throws: true,
};

/**
 * Format operations per second for display
 */
export function formatOpsPerSec(ops: number): string {
  if (ops >= 1_000_000) {
    return `${(ops / 1_000_000).toFixed(2)}M ops/sec`;
  }
  if (ops >= 1_000) {
    return `${(ops / 1_000).toFixed(2)}K ops/sec`;
  }
  return `${ops.toFixed(2)} ops/sec`;
}

/**
 * Options for Effect to disable infinite loop detection in benchmarks
 */
export const benchEffectOptions = {
  maxExecutionsPerSecond: Infinity,
  maxExecutionsPerFlush: Infinity,
};

// Warmup disabled so JIT hasn't seen the hot path yet
export const coldBenchOptions: BenchOptions = {
  time: 2000,
  iterations: 500,
  warmupTime: 0,
  warmupIterations: 0,
  throws: true,
};

/**
 * Format time in appropriate unit
 */
export function formatTime(ms: number): string {
  if (ms < 0.001) {
    return `${(ms * 1_000_000).toFixed(2)}ns`;
  }
  if (ms < 1) {
    return `${(ms * 1_000).toFixed(2)}μs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Calculate statistics from an array of numbers
 */
export interface Statistics {
  min: number;
  max: number;
  mean: number;
  median: number;
  p75: number;
  p95: number;
  p99: number;
  stdDev: number;
}

export function calculateStatistics(values: number[]): Statistics {
  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;

  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / len;

  const variance = sorted.reduce((acc, val) => acc + (val - mean) ** 2, 0) / len;
  const stdDev = Math.sqrt(variance);

  const percentile = (p: number) => {
    const index = Math.ceil((p / 100) * len) - 1;
    return sorted[Math.max(0, index)];
  };

  return {
    min: sorted[0] ?? 0,
    max: sorted[len - 1] ?? 0,
    mean,
    median: percentile(50) ?? 0,
    p75: percentile(75) ?? 0,
    p95: percentile(95) ?? 0,
    p99: percentile(99) ?? 0,
    stdDev,
  };
}

/**
 * Get current memory usage
 */
export function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
} {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
  };
}

/**
 * Force garbage collection if available
 * Run Node with --expose-gc flag to enable
 */
export function forceGC(): void {
  if (globalThis.gc) {
    globalThis.gc();
  }
}

export let _sink: any;
/**
 * Prevents Dead Code Elimination (DCE) by assigning the value to a sink.
 * Use this in benchmarks for values that aren't otherwise consumed.
 */
export function keep(value: any): void {
  _sink = value;
  if (Date.now() < 0) {
    console.log(_sink);
  }
}

/**
 * Environment metadata for annotating benchmark result files.
 */
export interface EnvMeta {
  nodeVersion: string;
  platform: string;
  arch: string;
  date: string;
}

/** Collect runtime environment information for result annotation. */
export function getEnvMeta(): EnvMeta {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    date: new Date().toISOString(),
  };
}

export interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
  createdAt: Date;
}

export interface DataGridRow {
  id: number;
  name: string;
  age: number;
  email: string;
  department: string;
  salary: number;
  startDate: Date;
  active: boolean;
}

/**
 * Generate todo items for benchmarking
 */
export function generateTodos(count: number): TodoItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    text: `Todo item ${i + 1}`,
    completed: i % 3 === 0,
    createdAt: new Date(Date.now() - i * 1000 * 60),
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
    age: 20 + (i % 50),
    email: `user${i}@example.com`,
    department: departments[i % departments.length]!,
    salary: 50000 + (i % 10) * 10000,
    startDate: new Date(2020, 0, 1 + (i % 365)),
    active: i % 5 !== 0,
  }));
}

/**
 * Generate random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random string of specified length
 */
export function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Generate array of random numbers
 */
export function randomNumbers(count: number, min = 0, max = 1000): number[] {
  return Array.from({ length: count }, () => randomInt(min, max));
}

// ---------------------------------------------------------------------------
// Size-keyed helpers
// ---------------------------------------------------------------------------

export const SIZES = { small: 10, medium: 100, large: 1000 } as const;
export type SizeKey = keyof typeof SIZES;

export function generateTodosBySizeKey(size: SizeKey): TodoItem[] {
  return generateTodos(SIZES[size]);
}

export function generateGridBySizeKey(size: SizeKey): DataGridRow[] {
  return generateGridData(SIZES[size]);
}

/**
 * Generate a corpus of searchable strings for search-as-you-type benchmarks.
 */
export function generateSearchCorpus(size: SizeKey): string[] {
  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];
  return Array.from({ length: SIZES[size] }, (_, i) => `${words[i % words.length]} item ${i}`);
}
