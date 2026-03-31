# Benchmark Documentation

Comprehensive benchmarking suite for `atom-effect` to measure performance and detect regressions.

## Performance Summary

| Category | Key Metric | Value | Context |
| ---------- | ---------- | ----- | ------- |
| **Atom** | Read 1000x (peek) | 808.4K ops/sec | Near-native array access speed |
| **Computed** | Recompute (cached) | 197.1K ops/sec | Efficient recompute logic |
| **Effect** | Execution (single dep) | 334.1K ops/sec | Low-overhead notify |
| **Real-world** | Todo full workflow | 405.5K ops/sec | Production-ready performance |
| **Frame Budget** | 100 atom updates | 0.0022ms | well under 16ms budget |

## Running Benchmarks

### Quick Start

```bash
# Run all benchmarks
pnpm bench

# Run only micro-benchmarks
pnpm bench:micro

# Run only macro-benchmarks
pnpm bench:macro
```

### Specific Benchmarks

```bash
# Run atom benchmarks
pnpm bench:atom

# Run computed benchmarks
pnpm bench:computed

# Run effect benchmarks
pnpm bench:effect
```

## Benchmark Categories

### Micro-Benchmarks

Located in `__benchmarks__/micro/`, these test individual primitive operations:

- **Atom**: Creation, reads (value/peek), writes, subscriptions, disposal
- **Computed**: Dependency tracking, recomputation, lazy evaluation, cache invalidation
- **Effect**: Creation, execution, cleanup, disposal
- **Batch**: Batched vs non-batched updates, nested batches
- **Untracked**: Untracked reads, mixed operations
- **Propagation**: Fan-in, Fan-out, Deep chain propagation

### Macro-Benchmarks

Located in `__benchmarks__/macro/`, these test real-world scenarios:

- **Todo App**: Create, toggle, filter, delete (100 items)
- **Data Grid**: Sort, filter, paginate (1000 rows × 10 columns)
- **Dependency Graphs**: Deep chains, wide fan-out, diamond patterns
- **Memory Stress**: Create/dispose 10K atoms, GC pressure, leak detection

### Realistic-Benchmarks

Production-like scenarios:

- **Frame Budget**: Stay within 16ms frame budget
- **Memory Stability**: Memory after component churn
- **Batch Efficiency**: Form reset performance
- **Input Latency**: Input to render latency

## Interpreting Results

### Reading the Numbers

- **ops/sec (Hz)**: Operations per second. **Higher is better**.
- **Mean (ms)**: Average time per operation.
- **p99 (ms)**: 99th percentile latency (worst-case for 99% of operations).

### What Good Performance Looks Like

| Metric | Good Performance | Why It Matters |
| -------- | ---------------- | -------------- |
| **Atom reads (peek)** | >500K ops/sec | Near-native speed, negligible overhead |
| **Computed recompute** | >1M ops/sec | Cached reads should be nearly free |
| **Effect execution** | >1M ops/sec | Fast propagation ensures responsiveness |
| **Frame budget** | <16ms | Stays within browser's 60fps budget |

### Red Flags

- **Atom writes <100K ops/sec**: Indicates scheduler overhead
- **Computed recompute <100K ops/sec**: Cache invalidation issues
- **Frame budget >16ms**: Risk of janky UI
- **Memory leaks**: Growing heap after disposal cycles

## Latest Results

**Version**: v0.27.0
**Last Updated**: 2026-03-31
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> **[View Detailed Results](./BENCHMARKS_DETAILED.md)**

### Key Highlights

| Benchmark | Result | Analysis |
| ---------- | ------ | -------- |
| Atom peek (1000x) | 808.4K ops/sec | Near-native performance |
| Computed read (1000x) | 610.9K ops/sec | Low-overhead tracking |
| Effect execution (single) | 334.1K ops/sec | Efficient subscriber notify |
| Todo workflow | 405.5K ops/sec | Production-ready (Complete workflow) |
| Frame Budget (100 atoms) | 0.0022ms | Well under 16ms |
| Data Grid Filter (1000x) | 0.0048ms | Real-time filtering |

## Contributing Benchmarks

When adding new benchmarks:

1. **Micro**: Test a single primitive operation in isolation
2. **Macro**: Test a realistic workflow (e.g., "shopping cart checkout")
3. **Realistic**: Simulate production constraints (frame budget, memory)

See [CONTRIBUTING.md](../../../CONTRIBUTING.md#benchmarks) for details.
