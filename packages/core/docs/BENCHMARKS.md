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

## Latest Results (v0.11.0)

**Date**: 2026-01-19  
**Environment**: GitHub Actions, Node.js 20.x, V8 Engine  

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 6,159,967 | 0.0002 | 0.0002 |
| Create (Object) | 6,039,819 | 0.0002 | 0.0002 |
| Create 100 Atoms | 74,467 | 0.0134 | 0.0220 |
| Read (Value) | 11,564,514 | 0.0001 | 0.0001 |
| Read (Peek) | 18,082,907 | 0.0001 | 0.0001 |
| Read 100 Atoms | 364,824 | 0.0027 | 0.0028 |
| Write (Single) | 9,449,635 | 0.0001 | 0.0001 |
| Write (10 times) | 4,890,767 | 0.0002 | 0.0002 |
| Write 100 Atoms | 212,241 | 0.0047 | 0.0050 |
| Subscribe/Unsubscribe | 10,348,878 | 0.0001 | 0.0001 |
| Notify (1 Subscriber) | 2,966,565 | 0.0003 | 0.0005 |
| Notify (10 Subscribers) | 2,827,884 | 0.0004 | 0.0005 |
| Dispose | 5,912,919 | 0.0002 | 0.0002 |
| Dispose (with Subscribers) | 3,787,680 | 0.0003 | 0.0004 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,853,284 | 0.0005 | 0.0009 |
| Create (3 Deps) | 1,324,875 | 0.0008 | 0.0011 |
| Create Chain (100) | 8,192 | 0.1221 | 0.3020 |
| Read (Single Dep) | 6,292,874 | 0.0002 | 0.0002 |
| Read (Multiple) | 6,058,847 | 0.0002 | 0.0002 |
| Nested Computation | 6,227,688 | 0.0002 | 0.0002 |
| Recompute (Single Dep) | 557,927 | 0.0018 | 0.0030 |
| Recompute (Chain of 10) | 80,901 | 0.0124 | 0.0214 |
| No Recompute (Unchanged) | 5,672,907 | 0.0002 | 0.0002 |
| Lazy (Not Accessed) | 1,885,515 | 0.0005 | 0.0010 |
| Lazy (Accessed Once) | 528,485 | 0.0019 | 0.0025 |
| Lazy (Multiple Access) | 477,033 | 0.0021 | 0.0027 |
| Cache Invalidation | 540,320 | 0.0019 | 0.0023 |
| Diamond Invalidation | 222,630 | 0.0045 | 0.0054 |
| Dispose | 1,636,770 | 0.0006 | 0.0010 |
| Dispose Chain | 237,434 | 0.0042 | 0.0053 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 273,084 | 0.0037 | 0.0071 |
| Create (Multiple Deps) | 231,167 | 0.0043 | 0.0065 |
| Create 10 Effects | 28,754 | 0.0348 | 0.0573 |
| Execution (Dep Change) | 2,493,594 | 0.0004 | 0.0007 |
| Execution (Multiple) | 1,637,801 | 0.0006 | 0.0009 |
| With Computed Dep | 2,331,986 | 0.0004 | 0.0007 |
| Re-runs (10 times) | 741,687 | 0.0013 | 0.0021 |
| Multiple on Same Dep | 2,421,525 | 0.0004 | 0.0007 |
| With Cleanup | 238,199 | 0.0042 | 0.0052 |
| Cleanup on Dep Change | 2,544,661 | 0.0004 | 0.0006 |
| Dispose | 272,589 | 0.0037 | 0.0048 |
| Dispose (with Cleanup) | 265,879 | 0.0038 | 0.0048 |
| Dispose 10 Effects | 28,211 | 0.0354 | 0.0590 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 4,112,111 | 0.0002 | 0.0004 |
| Batch Update (10) | 2,677,331 | 0.0004 | 0.0004 |
| Batch Update (100) | 583,937 | 0.0017 | 0.0018 |
| Without Batch (10) | 819,013 | 0.0012 | 0.0016 |
| With Batch (10) | 162,192 | 0.0062 | 0.0099 |
| Nested Batch (2 levels) | 3,049,710 | 0.0003 | 0.0004 |
| Nested Batch (5 levels) | 1,425,926 | 0.0007 | 0.0008 |
| Batch with Computed | 234,261 | 0.0043 | 0.0050 |
| Batch with Diamond | 197,379 | 0.0051 | 0.0061 |
| Untracked Read (Single) | 6,055,391 | 0.0002 | 0.0002 |
| Untracked Read (Multiple) | 4,279,538 | 0.0002 | 0.0003 |
| Peek vs Value | 5,911,521 | 0.0002 | 0.0002 |
| Tracked (3 Deps) | 498,156 | 0.0020 | 0.0025 |
| Untracked (Ignores) | 4,940,853 | 0.0002 | 0.0002 |
| Partial Tracking | 414,142 | 0.0024 | 0.0030 |
| Nested Untracked | 2,494,632 | 0.0004 | 0.0004 |
| 100% Tracking | 385,570 | 0.0026 | 0.0032 |
| 50% Tracking | 394,203 | 0.0025 | 0.0031 |
| 0% Tracking | 4,625,224 | 0.0002 | 0.0002 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 775 | 1.2899 | 2.1056 |
| 1 to N (Fan Out 1000) | 711 | 1.4056 | 1.8278 |
| N to 1 (Fan In 1000) | 8,484 | 0.1179 | 0.2443 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 6,931 | 0.1443 | 0.2209 |
| Create/Dispose 1K Computeds | 2,028 | 0.4931 | 0.9519 |
| Create/Dispose 1K Effects | 565 | 1.7708 | 2.4898 |
| Rapid GC (10K Cycles) | 1,119 | 0.8938 | 1.1614 |
| Subscription Churn (1K) | 41,613 | 0.0240 | 0.1103 |
| Object Pooling (10K) | 19 | 53.9784 | 56.0884 |
| Weak Reference Cleanup (1K) | 2,021 | 0.4949 | 0.9219 |
| Effect Cleanup (1K) | 138 | 7.2471 | 8.0542 |
| Circular Reference Cleanup | 44,882 | 0.0223 | 0.0419 |
| Large State Tree (10K) | 898 | 1.1133 | 1.9968 |
| Memory Usage Monitoring | 146 | 6.8653 | 7.4500 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,164 | 0.2401 | 0.4286 |
| Sort (Name) | 4,697 | 0.2129 | 0.4098 |
| Sort (Salary) | 8,968 | 0.1115 | 0.1445 |
| Filter (Department) | 15,998 | 0.0625 | 0.0869 |
| Paginate (10/page) | 457,311 | 0.0022 | 0.0027 |
| Sort + Filter + Paginate | 603 | 1.6590 | 1.8655 |
| Update Single Row | 137,031 | 0.0073 | 0.0104 |
| Batch Update (100 Rows) | 1,336 | 0.7487 | 0.9832 |
| Select/Deselect Rows | 1,864 | 0.5365 | 0.8883 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,476 | 0.1180 | 0.1713 |
| Wide Fan-out (1→100) | 7,484 | 0.1336 | 0.1627 |
| Diamond Pattern | 35,829 | 0.0279 | 0.0374 |
| Pyramid (50 levels) | 13,641 | 0.0733 | 0.0938 |
| Mixed (100A, 200C) | 36,584 | 0.0273 | 0.0358 |
| Circular Avoidance | 195,083 | 0.0051 | 0.0071 |
| Conditional Deps | 392,244 | 0.0025 | 0.0030 |
| Array Dynamic Deps | 396,547 | 0.0025 | 0.0031 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 829,988 | 0.0012 | 0.0022 |
| Toggle Completion | 9,526 | 0.1050 | 0.1446 |
| Filter (Active/Completed) | 454,905 | 0.0022 | 0.0029 |
| Delete (50 from 100) | 43,446 | 0.0230 | 0.0461 |
| Complete Workflow | 93,260 | 0.0107 | 0.0238 |
| Stats with Auto-update | 476,091 | 0.0021 | 0.0047 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame | 73,241 | 0.0137 | 0.0228 |
| Updates per frame (batched) | 32,736 | 0.0305 | 0.0434 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 2,619 | 0.3818 | 2.3286 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 144,956 | 0.0069 | 0.0142 |
| Form reset (no batch) | 623,289 | 0.0016 | 0.0027 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 4,673 | 0.2140 | 0.4911 |
