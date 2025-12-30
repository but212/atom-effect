/**
 * @fileoverview benchmark runner utility
 */

import type { Task } from 'tinybench';
import { Bench } from 'tinybench';

export interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  meanTime: number;
  margin: number;
  samples: number;
}

export interface BenchmarkOptions {
  name: string;
  time?: number;
  iterations?: number;
  maxSamples?: number;
  warmup?: boolean;
  warmupTime?: number;
  warmupIterations?: number;
}

const DEFAULT_ITERATIONS = 10;
const DEFAULT_TIME = 20;
const DEFAULT_WARMUP_ITERATIONS = 3;
const DEFAULT_MAX_SAMPLES = 2_000;
const TIME_SAFETY_FACTOR = 0.05;

function tryGc(): void {
  const gc = (globalThis as unknown as { gc?: () => void }).gc;
  if (typeof gc === 'function') {
    try {
      gc();
    } catch {
      // ignore
    }
  }
}

type BenchmarkTask = {
  name: string;
  fn: () => void | Promise<void>;
};

function nowMs(): number {
  const perfNow = globalThis.performance?.now;
  return typeof perfNow === 'function' ? perfNow.call(globalThis.performance) : Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function calibrateOpsPerSec(fn: () => void | Promise<void>): Promise<number> {
  const calibrationIterations = 50;

  const start = nowMs();
  for (let i = 0; i < calibrationIterations; i++) {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
  }
  const elapsedMs = Math.max(0.001, nowMs() - start);
  return (calibrationIterations / elapsedMs) * 1000;
}

/**
 * benchmark runner
 */
export class BenchmarkRunner {
  private results: BenchmarkResult[] = [];
  private tasks: BenchmarkTask[] = [];
  private options: BenchmarkOptions;

  constructor(options: BenchmarkOptions) {
    this.options = options;
  }

  /**
   * add benchmark
   */
  add(name: string, fn: () => void | Promise<void>): this {
    this.tasks.push({ name, fn });
    return this;
  }

  /**
   * run benchmark
   */
  async run(): Promise<BenchmarkResult[]> {
    const maxTime = this.options.time ?? DEFAULT_TIME;
    const iterations = this.options.iterations ?? DEFAULT_ITERATIONS;
    const warmup = this.options.warmup ?? true;
    const warmupTime = this.options.warmupTime ?? 100;
    const warmupIterations = this.options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS;
    const maxSamples = this.options.maxSamples ?? DEFAULT_MAX_SAMPLES;

    const results: BenchmarkResult[] = [];

    for (const t of this.tasks) {
      tryGc();
      const estimatedOps = await calibrateOpsPerSec(t.fn);
      const estimatedTimeMs = (maxSamples / Math.max(1, estimatedOps)) * 1000;
      // Be conservative: calibration is usually slower than the real tight loop.
      // If we trust it too much, super-fast tasks will collect huge sample arrays.
      const time = clamp(estimatedTimeMs * TIME_SAFETY_FACTOR, 1, maxTime);

      const bench = new Bench({
        name: this.options.name,
        time,
        iterations,
        warmup,
        warmupTime,
        warmupIterations,
      });
      bench.add(t.name, t.fn);
      await bench.run();
      tryGc();

      const task = bench.tasks[0] as Task | undefined;
      results.push({
        name: t.name,
        opsPerSec: task?.result?.throughput?.mean || 0,
        meanTime: task?.result?.latency?.mean || 0,
        margin: task?.result?.latency?.rme || 0,
        samples: task?.result?.latency?.samples?.length || 0,
      });
    }

    this.results = results;

    return this.results;
  }

  /**
   * print results as table
   */
  printTable(): void {
    console.table(
      this.results.map((r) => ({
        Benchmark: r.name,
        'Ops/sec': r.opsPerSec.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        'Mean (ms)': (r.meanTime * 1000).toFixed(4),
        'Margin (±%)': r.margin.toFixed(2),
        Samples: r.samples,
      }))
    );
  }

  /**
   * get results as json
   */
  getResults(): BenchmarkResult[] {
    return this.results;
  }

  /**
   * get fastest benchmark
   */
  getFastest(): BenchmarkResult | null {
    if (this.results.length === 0) return null;
    return this.results.reduce((fastest, current) =>
      current.opsPerSec > fastest.opsPerSec ? current : fastest
    );
  }

  /**
   * get slowest benchmark
   */
  getSlowest(): BenchmarkResult | null {
    if (this.results.length === 0) return null;
    return this.results.reduce((slowest, current) =>
      current.opsPerSec < slowest.opsPerSec ? current : slowest
    );
  }
}

/**
 * run benchmark
 */
export async function runBenchmark(
  name: string,
  benchmarks: Record<string, () => void | Promise<void>>,
  options?: Partial<BenchmarkOptions>
): Promise<BenchmarkResult[]> {
  const runner = new BenchmarkRunner({ name, ...options });

  for (const [benchName, fn] of Object.entries(benchmarks)) {
    runner.add(benchName, fn);
  }

  const results = await runner.run();

  console.log(`\n${name}`);
  console.log('='.repeat(80));
  runner.printTable();

  const fastest = runner.getFastest();
  const slowest = runner.getSlowest();

  if (fastest && slowest && results.length > 1) {
    const diff = (((fastest.opsPerSec - slowest.opsPerSec) / slowest.opsPerSec) * 100).toFixed(2);
    console.log(`\nFastest: ${fastest.name}`);
    console.log(`Slowest: ${slowest.name}`);
    console.log(`Difference: ${diff}% faster`);
  }

  return results;
}

/**
 * benchmark result type
 */
export interface BenchmarkRunResult {
  name: string;
  results: BenchmarkResult[];
}
