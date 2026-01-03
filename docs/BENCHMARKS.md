# Benchmark Documentation

Comprehensive benchmarking suite for `atom-effect` to measure performance and detect regressions.

## Overview

The benchmark suite consists of:

- **Micro-benchmarks**: Test individual operations (atom, computed, effect, batch, untracked)
- **Macro-benchmarks**: Test real-world scenarios (todo app, data grid, dependency graphs, memory stress)

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

#### Atom Benchmarks

- Creation (primitive, object, batch)
- Read operations (value, peek)
- Write operations (single, multiple)
- Subscription management
- Disposal

#### Computed Benchmarks

- Creation with various dependency counts
- Dependency tracking
- Recomputation efficiency
- Lazy evaluation
- Cache invalidation

#### Effect Benchmarks

- Creation and execution
- Dependency tracking
- Re-execution on changes
- Cleanup handling
- Disposal

#### Batch Benchmarks

- Batch vs non-batch updates
- Nested batches
- Batch with computed values

#### Untracked Benchmarks

- Untracked reads
- Mixed tracked/untracked operations
- Performance comparison

### Macro-Benchmarks

Located in `__benchmarks__/macro/`, these test real-world scenarios:

#### Todo App

- Create 100 todos
- Toggle completion status
- Filter (all/active/completed)
- Delete todos
- Complete workflow simulation

#### Data Grid

- 1000 rows × 10 columns
- Sorting by different fields
- Filtering by department
- Pagination
- Combined operations

#### Dependency Graphs

- Deep chains (100+ levels)
- Wide fan-out (1 → 100 dependents)
- Diamond dependencies
- Pyramid patterns
- Dynamic dependencies

#### Memory Stress

- Create/dispose 10K atoms
- GC pressure tests
- Memory leak detection
- Object pooling stress
- Large state trees

## Interpreting Results

Benchmark results show:

- **Operations per second (ops/sec)**: Higher is better
- **Mean time**: Average time per operation
- **Margin of error**: Statistical variance
- **Percentiles (p75, p95, p99)**: Distribution of execution times

## Latest Results (v0.2.0)

**Date**: 2026-01-04  
**Environment**: GitHub Actions (`ubuntu-latest`), Node.js 20.x, V8 Engine

### Performance Highlights

- **Atom Read/Write**: ~4.4M ops/sec
- **Computed Creation**: ~1.7M ops/sec
- **Computed Recompute**: ~510K ops/sec
- **Ultra-low Latency**: ~0.0003ms P99 for atom writes

---

### 1. Micro-Benchmarks

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,736,908 | 0.0006 | 0.0010 |
| Create (3 Deps) | 1,163,695 | 0.0009 | 0.0015 |
| Create Chain (100) | 7,036 | 0.1421 | 0.3438 |
| Read (Single Dep) | 624,899 | 0.0016 | 0.0025 |
| Read (Multiple) | 432,840 | 0.0023 | 0.0035 |
| Nested Computation | 356,451 | 0.0028 | 0.0047 |
| Recompute (Single) | 507,683 | 0.0020 | 0.0025 |
| Lazy (Not Accessed) | 1,749,261 | 0.0006 | 0.0009 |
| Dispose | 1,515,354 | 0.0007 | 0.0012 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single) | 479,099 | 0.0021 | 0.0046 |
| Create (Multiple) | 355,714 | 0.0028 | 0.0056 |
| Execution (Change) | 423,017 | 0.0024 | 0.0051 |
| Re-execution (10x) | 378,532 | 0.0026 | 0.0054 |
| Cleanup (Function) | 418,229 | 0.0024 | 0.0051 |
| Dispose | 481,950 | 0.0021 | 0.0048 |

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 4,860,994 | 0.0002 | 0.0003 |
| Read (Value) | 4,208,016 | 0.0002 | 0.0003 |
| Write (Single) | 4,636,509 | 0.0002 | 0.0003 |
| Subscribe/Unsub | 2,926,949 | 0.0003 | 0.0005 |
| Notify (1 Sub) | 1,925,694 | 0.0005 | 0.0008 |
| Dispose | 4,597,872 | 0.0002 | 0.0003 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 2,200,569 | 0.0005 | 0.0007 |
| Batch Update (10) | 412,808 | 0.0024 | 0.0030 |
| Nested Batch (2) | 1,857,953 | 0.0005 | 0.0008 |
| Untracked Read | 2,992,427 | 0.0003 | 0.0005 |
| Peek | 2,894,535 | 0.0003 | 0.0004 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) |
| --- | --- | --- |
| 1K Atoms Churn | 5,942 | 0.1683 |
| 1K Effects Churn | 478 | 2.0904 |
| Rapid GC (10K Cycles) | 851 | 1.1748 |
| Large State (10K Tree) | 911 | 1.0968 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,038 | 0.2476 | 0.4780 |
| Sort (Name) | 1,425 | 0.7013 | 7.9256 |
| Filter (Dept) | 1,941 | 0.5150 | 11.9643 |
| Update Row | 4,010 | 0.2494 | 0.5661 |
| Batch Update (100) | 1,463 | 0.6832 | 1.0407 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100) | 3,621 | 0.2761 | 8.6064 |
| Wide Fan-out | 8,065 | 0.1240 | 0.3779 |
| Diamond Pattern | 34,155 | 0.0293 | 0.0394 |
| Conditional Deps | 345,774 | 0.0029 | 0.0035 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 | 38,383 | 0.0261 | 0.0950 |
| Toggle Status | 14,598 | 0.0685 | 0.0881 |
| Filter Active | 25,332 | 0.0395 | 0.0617 |
| Complete Workflow | 26,622 | 0.0376 | 0.0606 |
