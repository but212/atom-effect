# Benchmark Documentation

Comprehensive benchmarking suite for `atom-effect` to measure performance and detect regressions.

## Overview

The benchmark suite consists of:

- **Micro-benchmarks**: Test individual operations (atom, computed, effect, batch, untracked)
- **Macro-benchmarks**: Test real-world scenarios (todo app, data grid, dependency graphs, memory stress)
- **Realistic-benchmarks**: Test production-like scenarios (shopping cart, frame budget, input latency)

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
- Disposal

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

## Latest Results (v0.17.0)

**Date**: 2026-01-28  
**Environment**: Local Windows Environment, Node.js, V8 Engine  

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 8,299 | 0.1205 | 0.6866 |
| Create 1000 Atoms (Objects) | 8,399 | 0.1191 | 0.6891 |
| Read 1000 Atoms (Value) | 36,290 | 0.0276 | 0.0355 |
| Read 1000 Atoms (Peek) | 586,474 | 0.0017 | 0.0019 |
| Write 1000 Atoms | 344,080 | 0.0029 | 0.0030 |
| Subscribe/Unsubscribe (x100) | 143,945 | 0.0069 | 0.0128 |
| Notify 1 Subscriber (x1000) | 35,531 | 0.0281 | 0.0392 |
| Untracked Read (x1000) | 35,982 | 0.0278 | 0.0359 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,374 | 0.4213 | 1.1110 |
| Create (3 Deps) (x1000) | 1,514 | 0.6607 | 1.4385 |
| Create Chain (100) | 10,708 | 0.0934 | 0.1190 |
| Read (Single Dep) (x1000) | 14,743 | 0.0678 | 0.0790 |
| Read (Multiple) (x1000) | 14,124 | 0.0708 | 0.1291 |
| Nested Computation (x1000) | 13,960 | 0.0716 | 0.0867 |
| Recompute (Single Dep) | 782,192 | 0.0013 | 0.0016 |
| Recompute (Chain of 10) | 145,187 | 0.0069 | 0.0093 |
| No Recompute (Unchanged) (x1000) | 13,862 | 0.0721 | 0.0820 |
| Lazy (Not Accessed) (x1000) | 2,709 | 0.3691 | 1.0842 |
| Lazy (Accessed Once) | 678,049 | 0.0015 | 0.0017 |
| Lazy (Multiple Access) | 614,619 | 0.0016 | 0.0019 |
| Cache Invalidation | 738,917 | 0.0014 | 0.0022 |
| Diamond Invalidation | 360,971 | 0.0028 | 0.0032 |
| Dispose (x1000) | 1,973 | 0.5069 | 1.2428 |
| Dispose Chain | 270,688 | 0.0037 | 0.0041 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 307,246 | 0.0033 | 0.0056 |
| Create (Multiple Deps) | 236,481 | 0.0042 | 0.0059 |
| Create 10 Effects | 35,182 | 0.0284 | 0.0452 |
| Execution (Dep Change) (x1000) | 21,025 | 0.0476 | 0.0658 |
| Execution (Multiple) (x1000) | 9,944 | 0.1006 | 0.1210 |
| With Computed Dep (x1000) | 21,082 | 0.0474 | 0.0595 |
| Re-runs (10 times) | 1,118,393 | 0.0009 | 0.0012 |
| Multiple on Same Dep (x1000) | 21,080 | 0.0474 | 0.0584 |
| With Cleanup | 272,538 | 0.0037 | 0.0047 |
| Cleanup on Dep Change (x1000) | 21,029 | 0.0476 | 0.0588 |
| Dispose | 306,439 | 0.0033 | 0.0038 |
| Dispose (with Cleanup) | 305,794 | 0.0033 | 0.0039 |
| Dispose 10 Effects | 34,748 | 0.0288 | 0.0455 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 3,664 | 0.2729 | 0.3465 |
| Batch Update (10) (x1000) | 1,998 | 0.5004 | 0.5682 |
| Batch Update (100) | 417,275 | 0.0024 | 0.0038 |
| Without Batch (10) | 580,250 | 0.0017 | 0.0020 |
| With Batch (10) | 179,701 | 0.0056 | 0.0100 |
| Nested Batch (2 levels) (x1000) | 2,599 | 0.3847 | 0.5105 |
| Nested Batch (5 levels) (x1000) | 1,278 | 0.7822 | 0.9192 |
| Batch with Computed | 294,142 | 0.0034 | 0.0038 |
| Batch with Diamond | 285,869 | 0.0035 | 0.0040 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,506 | 0.6640 | 1.0514 |
| 1 to N (Fan Out 1000) | 1,289 | 0.7756 | 1.4737 |
| N to 1 (Fan In 1000) | 14,402 | 0.0694 | 0.0953 |

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,950 | 0.2532 | 0.8919 |
| Create/Dispose 1K Computeds | 2,586 | 0.3867 | 1.0509 |
| Create/Dispose 1K Effects | 264 | 3.7899 | 17.2182 |
| Rapid GC (10K Cycles) | 492 | 2.0329 | 2.6131 |
| Subscription Churn (1K) | 15,279 | 0.0654 | 0.1712 |
| Object Pooling (10K) | 15 | 67.5775 | 69.3136 |
| Weak Reference Cleanup (1K) | 2,593 | 0.3857 | 1.0562 |
| Effect Cleanup (1K) | 99 | 10.0701 | 14.9588 |
| Circular Reference Cleanup | 21,012 | 0.0476 | 0.0617 |
| Large State Tree (10K) | 599 | 1.6706 | 5.1218 |
| Memory Usage Monitoring | 160 | 6.2457 | 7.2107 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,642 | 0.2154 | 0.4131 |
| [Atom] Initialize | 4,607 | 0.2170 | 0.4704 |
| [Vanilla] Sort (Name) | 4,279 | 0.2337 | 0.2601 |
| [Atom] Sort (Name) | 1,995 | 0.5012 | 0.7652 |
| [Vanilla] Filter (Department) | 503,352 | 0.0020 | 0.0027 |
| [Atom] Filter (Department) | 24,971 | 0.0400 | 0.0489 |
| [Vanilla] Sort + Filter + Paginate | 4,338 | 0.2305 | 0.2566 |
| [Atom] Sort + Filter + Paginate | 1,927 | 0.5190 | 0.5827 |
| Select/Deselect Rows | 1,871 | 0.5345 | 0.7475 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 16,429 | 0.0609 | 0.0751 |
| Wide Fan-out (1→100) | 14,100 | 0.0709 | 0.0854 |
| Diamond Pattern | 64,681 | 0.0155 | 0.0242 |
| Pyramid (50 levels) | 25,210 | 0.0397 | 0.0501 |
| Mixed (100A, 200C) | 55,407 | 0.0180 | 0.0264 |
| Circular Avoidance | 325,047 | 0.0031 | 0.0036 |
| Conditional Deps | 497,300 | 0.0020 | 0.0024 |
| Array Dynamic Deps | 502,440 | 0.0020 | 0.0024 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 900,567 | 0.0011 | 0.0020 |
| Toggle Completion | 9,329 | 0.1072 | 0.2221 |
| Filter (Active/Completed) | 604,490 | 0.0017 | 0.0022 |
| Delete (50 from 100) | 44,130 | 0.0227 | 0.0455 |
| Complete Workflow | 182,754 | 0.0055 | 0.0117 |
| Stats with Auto-update | 522,633 | 0.0019 | 0.0044 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 58,912 | 0.0170 | 0.0269 |
| Updates per frame (100 atoms, batched) | 30,518 | 0.0328 | 0.0438 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 4,152 | 0.2409 | 0.8674 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 137,226 | 0.0073 | 0.0128 |
| Form reset (no batch) | 493,253 | 0.0020 | 0.0033 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 761,646 | 0.0013 | 0.0017 |
