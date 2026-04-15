/**
 * @fileoverview Benchmark setup utilities and configuration
 * @description Common utilities for benchmarking with Vitest and Tinybench
 */

import type { BenchOptions } from 'vitest';

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
  time: 2000, // 2 seconds per benchmark
  iterations: 20, // Minimum 20 iterations
  warmupTime: 200, // 200ms warmup
  warmupIterations: 5,
  throws: true,
};

/**
 * Memory stress test options
 * - Longer duration to observe GC behavior
 * - Fewer iterations to avoid system stress
 */
export const memoryBenchOptions: BenchOptions = {
  time: 3000, // 3 seconds per benchmark
  iterations: 50, // Minimum 50 iterations
  warmupTime: 500, // Longer warmup for GC stabilization
  warmupIterations: 3,
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

let _sink: any;
/**
 * Prevents Dead Code Elimination (DCE) by assigning the value to a sink.
 * Use this in benchmarks for values that aren't otherwise consumed.
 */
export function keep(value: any): void {
  _sink = value;
}
