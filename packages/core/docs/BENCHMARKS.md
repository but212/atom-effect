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

## Latest Results (v0.12.0)

**Date**: 2026-01-20  
**Environment**: GitHub Actions, Node.js 20.x, V8 Engine  

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 6,127,467 | 0.0002 | 0.0002 |
| Create (Object) | 6,062,028 | 0.0002 | 0.0003 |
| Create 100 Atoms | 68,300 | 0.0146 | 0.0297 |
| Read (Value) | 11,454,866 | 0.0001 | 0.0001 |
| Read (Peek) | 17,988,214 | 0.0001 | 0.0001 |
| Read 100 Atoms | 356,351 | 0.0028 | 0.0056 |
| Write (Single) | 9,435,686 | 0.0001 | 0.0001 |
| Write (10 times) | 5,101,828 | 0.0002 | 0.0002 |
| Write 100 Atoms | 250,764 | 0.0040 | 0.0040 |
| Subscribe/Unsubscribe | 10,864,873 | 0.0001 | 0.0001 |
| Notify (1 Subscriber) | 2,994,650 | 0.0003 | 0.0005 |
| Notify (10 Subscribers) | 2,859,899 | 0.0003 | 0.0005 |
| Dispose | 6,058,604 | 0.0002 | 0.0002 |
| Dispose (with Subscribers) | 4,349,746 | 0.0002 | 0.0003 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,962,763 | 0.0005 | 0.0009 |
| Create (3 Deps) | 1,425,578 | 0.0007 | 0.0009 |
| Create Chain (100) | 7,703 | 0.1298 | 0.3058 |
| Read (Single Dep) | 5,979,626 | 0.0002 | 0.0002 |
| Read (Multiple) | 5,848,476 | 0.0002 | 0.0002 |
| Nested Computation | 5,831,361 | 0.0002 | 0.0002 |
| Recompute (Single Dep) | 558,022 | 0.0018 | 0.0023 |
| Recompute (Chain of 10) | 77,305 | 0.0129 | 0.0224 |
| No Recompute (Unchanged) | 5,343,236 | 0.0002 | 0.0002 |
| Lazy (Not Accessed) | 2,009,215 | 0.0005 | 0.0008 |
| Lazy (Accessed Once) | 544,300 | 0.0018 | 0.0023 |
| Lazy (Multiple Access) | 478,887 | 0.0021 | 0.0026 |
| Cache Invalidation | 535,833 | 0.0019 | 0.0024 |
| Diamond Invalidation | 219,282 | 0.0046 | 0.0055 |
| Dispose | 1,790,679 | 0.0006 | 0.0007 |
| Dispose Chain | 281,575 | 0.0036 | 0.0042 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 270,925 | 0.0037 | 0.0075 |
| Create (Multiple Deps) | 237,405 | 0.0042 | 0.0056 |
| Create 10 Effects | 28,646 | 0.0349 | 0.0527 |
| Execution (Dep Change) | 2,746,474 | 0.0004 | 0.0006 |
| Execution (Multiple) | 1,783,815 | 0.0006 | 0.0009 |
| With Computed Dep | 2,388,100 | 0.0004 | 0.0007 |
| Re-runs (10 times) | 780,036 | 0.0013 | 0.0018 |
| Multiple on Same Dep | 2,534,354 | 0.0004 | 0.0007 |
| With Cleanup | 236,573 | 0.0042 | 0.0063 |
| Cleanup on Dep Change | 2,646,648 | 0.0004 | 0.0007 |
| Dispose | 273,612 | 0.0037 | 0.0045 |
| Dispose (with Cleanup) | 268,200 | 0.0037 | 0.0044 |
| Dispose 10 Effects | 27,844 | 0.0359 | 0.0532 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 3,855,776 | 0.0003 | 0.0003 |
| Batch Update (10) | 2,585,094 | 0.0004 | 0.0004 |
| Batch Update (100) | 582,724 | 0.0017 | 0.0018 |
| Without Batch (10) | 815,459 | 0.0012 | 0.0019 |
| With Batch (10) | 167,836 | 0.0060 | 0.0074 |
| Nested Batch (2 levels) | 3,060,690 | 0.0003 | 0.0004 |
| Nested Batch (5 levels) | 1,370,510 | 0.0007 | 0.0009 |
| Batch with Computed | 233,674 | 0.0043 | 0.0051 |
| Batch with Diamond | 191,088 | 0.0052 | 0.0062 |
| Untracked Read (Single) | 6,083,006 | 0.0002 | 0.0002 |
| Untracked Read (Multiple) | 4,479,237 | 0.0002 | 0.0003 |
| Peek vs Value | 6,304,599 | 0.0002 | 0.0002 |
| Tracked (3 Deps) | 499,629 | 0.0020 | 0.0028 |
| Untracked (Ignores) | 4,277,413 | 0.0002 | 0.0003 |
| Partial Tracking | 414,569 | 0.0024 | 0.0030 |
| Nested Untracked | 2,668,747 | 0.0004 | 0.0004 |
| 100% Tracking | 376,310 | 0.0027 | 0.0042 |
| 50% Tracking | 398,082 | 0.0025 | 0.0030 |
| 0% Tracking | 4,592,122 | 0.0002 | 0.0002 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 764 | 1.3084 | 3.5830 |
| 1 to N (Fan Out 1000) | 718 | 1.3922 | 1.8981 |
| N to 1 (Fan In 1000) | 8,708 | 0.1148 | 0.2431 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 7,215 | 0.1386 | 0.2247 |
| Create/Dispose 1K Computeds | 1,960 | 0.5100 | 0.9422 |
| Create/Dispose 1K Effects | 557 | 1.7939 | 2.5048 |
| Rapid GC (10K Cycles) | 1,149 | 0.8701 | 1.0269 |
| Subscription Churn (1K) | 48,429 | 0.0206 | 0.1079 |
| Object Pooling (10K) | 18 | 53.5828 | 55.0541 |
| Weak Reference Cleanup (1K) | 1,950 | 0.5128 | 0.9695 |
| Effect Cleanup (1K) | 137 | 7.2944 | 7.9522 |
| Circular Reference Cleanup | 44,820 | 0.0223 | 0.0321 |
| Large State Tree (10K) | 560 | 1.7840 | 11.4409 |
| Memory Usage Monitoring | 178 | 5.6176 | 6.9430 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,368 | 0.2289 | 0.4429 |
| Sort (Name) | 4,907 | 0.2038 | 0.3096 |
| Sort (Salary) | 8,837 | 0.1132 | 0.1454 |
| Filter (Department) | 17,756 | 0.0563 | 0.0675 |
| Paginate (10/page) | 454,247 | 0.0022 | 0.0029 |
| Sort + Filter + Paginate | 672 | 1.4877 | 1.9732 |
| Update Single Row | 134,362 | 0.0074 | 0.0153 |
| Batch Update (100 Rows) | 1,328 | 0.7526 | 0.9403 |
| Select/Deselect Rows | 1,862 | 0.5368 | 0.8252 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,031 | 0.1245 | 0.2437 |
| Wide Fan-out (1→100) | 7,200 | 0.1389 | 0.2176 |
| Diamond Pattern | 34,297 | 0.0292 | 0.0395 |
| Pyramid (50 levels) | 13,217 | 0.0757 | 0.0958 |
| Mixed (100A, 200C) | 38,774 | 0.0258 | 0.0347 |
| Circular Avoidance | 193,771 | 0.0052 | 0.0062 |
| Conditional Deps | 383,568 | 0.0026 | 0.0032 |
| Array Dynamic Deps | 386,816 | 0.0026 | 0.0031 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 767,665 | 0.0013 | 0.0023 |
| Toggle Completion | 9,388 | 0.1065 | 0.1319 |
| Filter (Active/Completed) | 438,916 | 0.0023 | 0.0034 |
| Delete (50 from 100) | 43,867 | 0.0228 | 0.0470 |
| Complete Workflow | 90,888 | 0.0110 | 0.0242 |
| Stats with Auto-update | 454,393 | 0.0022 | 0.0049 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame | 74,740 | 0.0134 | 0.0225 |
| Updates per frame (batched) | 32,633 | 0.0306 | 0.0407 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 2,738 | 0.3651 | 2.2761 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 148,251 | 0.0067 | 0.0137 |
| Form reset (no batch) | 626,147 | 0.0016 | 0.0027 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 4,867 | 0.2054 | 0.4866 |
