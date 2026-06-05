# Benchmark Documentation

This document outlines the benchmarking suite for `@but212/atom-effect`. The suite is used to quantify performance characteristics and monitor the system for potential regressions.

## Performance Metrics Summary

The following table summarizes key performance metrics observed in version `0.33.1`.

| Category | Metric | Result | Context |
| :--- | :--- | :--- | :--- |
| **Atom** | Read (untracked) | 3.22M ops/sec | Performance of non-reactive reads (x10) |
| **Computed** | Recompute (cached) | 371.4K ops/sec | Cached re-evaluation performance (x10) |
| **Effect** | Propagation | 1.15M ops/sec | Full atom → computed → effect cycle (x10) |
| **Workflow** | Todo App | 87.2K ops/sec | Comprehensive workflow performance |
| **Latency** | 100 Atom updates | 0.0103 ms | Mean execution time for batched updates |

---

## Running Benchmarks

Benchmarks are executed using the Vitest test runner. Because this project is structured as a monorepo, benchmark scripts can be executed either globally from the workspace root using package filters or directly within the `@but212/atom-effect` core package directory.

### Execution from the Workspace Root (Recommended)

To run benchmarks from the root of the monorepo, use the `--filter` flag to target the core package:

```bash
# Execute the full benchmark suite
pnpm --filter @but212/atom-effect bench

# Execute micro-benchmarks only
pnpm --filter @but212/atom-effect bench:micro

# Execute macro-benchmarks only
pnpm --filter @but212/atom-effect bench:macro

# Execute realistic scenario benchmarks
pnpm --filter @but212/atom-effect bench:realistic

# Execute state benchmarks only
pnpm --filter @but212/atom-effect bench:state
```

### Execution within the Core Package Directory

Alternatively, navigate to the core package directory to execute the scripts locally:

```bash
cd packages/core

# Execute the full benchmark suite
pnpm bench

# Execute micro-benchmarks only
pnpm bench:micro

# Execute macro-benchmarks only
pnpm bench:macro

# Execute realistic scenario benchmarks
pnpm bench:realistic

# Execute state benchmarks only
pnpm bench:state
```

### Targeted Execution

Specific benchmark suites can be targeted by passing a search pattern. The runner filters the test suites by matching the pattern against file paths:

```bash
# From the workspace root:
pnpm --filter @but212/atom-effect bench atoms
pnpm --filter @but212/atom-effect bench computeds

# Or inside packages/core/:
pnpm bench atoms
pnpm bench computeds
```

---

## Benchmark Categories

### 1. Micro-Benchmarks

Located in `__benchmarks__/micro/`, these tests measure the overhead of individual reactive primitives in isolation.

- **Atom**: Measures creation, reactive/non-reactive reads, writes, and subscription overhead.
- **Computed**: Measures dependency tracking efficiency, lazy evaluation overhead, and cache hit/miss performance.
- **Effect**: Measures execution scheduling, cleanup rotation, and disposal latency.
- **Propagation**: Stress tests various graph topologies, including deep chains, wide fan-outs (1-to-N), and fan-ins (N-to-1).

### 2. Macro-Benchmarks

Located in `__benchmarks__/macro/`, these tests simulate common application patterns without external dependencies (e.g., DOM).

- **Todo Workflow**: A complete sequence of adding, toggling, filtering, and deleting items.
- **Data Grid**: Performance of sorting, filtering, and pagination over large datasets (1000+ rows).
- **Graph Stress**: Evaluation of complex dependency structures such as diamond and pyramid patterns.

### 3. Realistic Scenarios

Located in `__benchmarks__/realistic/`, these tests evaluate the system under constraints typical of production environments.

- **Frame Budget Analysis**: Ensures that reactive updates complete within the 16.6ms window required for 60fps rendering.
- **Memory Stability**: Monitors heap usage during high-churn lifecycle cycles (mount/update/unmount).

---

## Interpretation of Results

### Metric Definitions

- **ops/sec (Hz)**: The number of operations completed per second. Higher values indicate greater throughput.
- **Mean (ms)**: The average time taken to complete a single operation.
- **p99 (ms)**: The 99th percentile latency, representing the upper bound for 99% of the operations.

### Performance Indicators

| Metric | Nominal Range | Rationale |
| :--- | :--- | :--- |
| **Atom reads (peek)** | > 500K ops/sec | Indicates minimal overhead for non-reactive state access. |
| **Computed recompute** | > 1M ops/sec | Indicates efficient cache validation and re-use. |
| **Effect execution** | > 1M ops/sec | Ensures rapid propagation across the dependency graph. |
| **Batch Latency** | < 16ms | Ensures compliance with browser rendering cycles. |

### Potential Issues

- **Throughput Drop**: Significant decreases in `ops/sec` for primitive operations often indicate increased internal overhead in the scheduler or tracking context.
- **Latency Spikes**: High `p99` values relative to the mean suggest periodic blocking operations or excessive Garbage Collection (GC) pressure.
- **Scaling Inefficiency**: Disproportionate performance degradation when increasing dependency depth (e.g., from 10 to 1000 nodes) indicates $O(N)$ or worse complexity in hot paths.

---

## Technical Specifications

**Version**: v0.33.1
**Last Updated**: 2026-06-05
**Environment**:

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> For a complete breakdown of all test cases and raw data, refer to the **[Detailed Benchmark Results](./BENCHMARKS_DETAILED.md)**.
