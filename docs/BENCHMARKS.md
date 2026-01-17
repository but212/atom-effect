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

## Latest Results (v0.7.0)

**Date**: 2026-01-17  
**Environment**: Github Actions, Node.js 20.x, V8 Engine  
**Architecture**: Push-State, Pull-Value reactive propagation

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 5,039,071 | 0.0002 | 0.0003 |
| Create (Object) | 4,993,496 | 0.0002 | 0.0003 |
| Create 100 Atoms | 56,946 | 0.0176 | 0.0276 |
| Read (Value) | 4,108,923 | 0.0002 | 0.0004 |
| Read (Peek) | 4,996,052 | 0.0002 | 0.0003 |
| Write (Single) | 4,565,007 | 0.0002 | 0.0004 |
| Write (10 times) | 2,945,705 | 0.0003 | 0.0004 |
| Subscribe/Unsubscribe | 4,027,761 | 0.0002 | 0.0003 |
| Notify (1 Subscriber) | 2,212,079 | 0.0005 | 0.0007 |
| Notify (10 Subscribers) | 1,538,108 | 0.0007 | 0.0010 |
| Dispose | 4,991,781 | 0.0002 | 0.0002 |
| Dispose (with Subscribers) | 3,857,978 | 0.0003 | 0.0004 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,745,034 | 0.0006 | 0.0009 |
| Create (3 Deps) | 1,161,353 | 0.0009 | 0.0012 |
| Create Chain (100) | 7,635 | 0.1310 | 0.3581 |
| Read (Single Dep) | 547,907 | 0.0018 | 0.0030 |
| Read (Multiple) | 402,603 | 0.0025 | 0.0043 |
| Nested Computation | 322,242 | 0.0031 | 0.0050 |
| Recompute (Single Dep) | 466,607 | 0.0021 | 0.0026 |
| Recompute (Chain of 10) | 81,452 | 0.0123 | 0.0214 |
| No Recompute (Unchanged) | 537,619 | 0.0019 | 0.0026 |
| Lazy (Not Accessed) | 1,710,050 | 0.0006 | 0.0009 |
| Lazy (Accessed Once) | 579,722 | 0.0017 | 0.0022 |
| Cache Invalidation | 447,177 | 0.0022 | 0.0033 |
| Diamond Invalidation | 207,595 | 0.0048 | 0.0065 |
| Dispose | 1,546,927 | 0.0006 | 0.0008 |
| Dispose Chain | 235,226 | 0.0043 | 0.0078 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 450,610 | 0.0022 | 0.0044 |
| Create (Multiple Deps) | 352,562 | 0.0028 | 0.0050 |
| Create 10 Effects | 50,045 | 0.0200 | 0.0374 |
| Execution (Dep Change) | 393,986 | 0.0025 | 0.0045 |
| Execution (Multiple) | 355,600 | 0.0028 | 0.0050 |
| With Computed Dep | 176,140 | 0.0057 | 0.0118 |
| Re-runs (10 times) | 359,340 | 0.0028 | 0.0049 |
| Multiple on Same Dep | 157,528 | 0.0063 | 0.0125 |
| With Cleanup | 392,708 | 0.0025 | 0.0043 |
| Cleanup on Dep Change | 388,980 | 0.0026 | 0.0040 |
| Dispose | 455,891 | 0.0022 | 0.0035 |
| Dispose (with Cleanup) | 441,737 | 0.0023 | 0.0042 |
| Dispose 10 Effects | 50,500 | 0.0198 | 0.0339 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 1,769,307 | 0.0006 | 0.0008 |
| Batch Update (10) | 364,480 | 0.0027 | 0.0034 |
| Batch Update (100) | 46,742 | 0.0214 | 0.0458 |
| Without Batch (10) | 77,721 | 0.0129 | 0.0269 |
| With Batch (10) | 50,969 | 0.0196 | 0.0373 |
| Nested Batch (2 levels) | 1,624,324 | 0.0006 | 0.0008 |
| Nested Batch (5 levels) | 459,995 | 0.0022 | 0.0028 |
| Batch with Computed | 134,728 | 0.0074 | 0.0120 |
| Batch with Diamond | 116,544 | 0.0086 | 0.0142 |
| Untracked Read (Single) | 3,198,064 | 0.0003 | 0.0004 |
| Untracked Read (Multiple) | 1,497,242 | 0.0007 | 0.0008 |
| Peek vs Value | 3,324,459 | 0.0003 | 0.0004 |
| Tracked (3 Deps) | 362,436 | 0.0028 | 0.0049 |
| Untracked (Ignores) | 473,671 | 0.0021 | 0.0028 |
| Partial Tracking | 329,303 | 0.0030 | 0.0037 |
| Nested Untracked | 1,215,889 | 0.0008 | 0.0010 |
| 100% Tracking | 193,887 | 0.0052 | 0.0107 |
| 50% Tracking | 177,834 | 0.0056 | 0.0106 |
| 0% Tracking | 245,056 | 0.0041 | 0.0049 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 868 | 1.1523 | 1.8523 |
| 1 to N (Fan Out 1000) | 766 | 1.3060 | 1.8480 |
| N to 1 (Fan In 1000) | 9,463 | 0.1057 | 0.2277 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 5,263 | 0.1900 | 0.4387 |
| Create/Dispose 1K Computeds | 2,099 | 0.4764 | 0.9068 |
| Create/Dispose 1K Effects | 503 | 1.9899 | 3.7751 |
| Rapid GC (10K Cycles) | 823 | 1.2145 | 1.3889 |
| Subscription Churn (1K) | 43,956 | 0.0227 | 0.1210 |
| Object Pooling (10K) | 18 | 54.0823 | 56.1339 |
| Weak Reference Cleanup (1K) | 2,075 | 0.4819 | 0.8673 |
| Effect Cleanup (1K) | 134 | 7.4422 | 9.0082 |
| Circular Reference Cleanup | 34,837 | 0.0287 | 0.0402 |
| Large State Tree (10K) | 924 | 1.0821 | 1.7601 |
| Memory Usage Monitoring | 181 | 5.5399 | 6.0475 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,284 | 0.2334 | 0.4452 |
| Sort (Name) | 1,384 | 0.7224 | 8.1342 |
| Sort (Salary) | 1,631 | 0.6129 | 8.0698 |
| Filter (Department) | 1,896 | 0.5275 | 11.8047 |
| Paginate (10/page) | 2,116 | 0.4726 | 10.4342 |
| Sort + Filter + Paginate | 604 | 1.6548 | 8.4298 |
| Update Single Row | 4,017 | 0.2490 | 0.5908 |
| Batch Update (100 Rows) | 1,449 | 0.6902 | 1.1002 |
| Select/Deselect Rows | 1,819 | 0.5499 | 0.8781 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,200 | 0.1219 | 0.3079 |
| Wide Fan-out (1→100) | 6,745 | 0.1483 | 0.3166 |
| Diamond Pattern | 32,711 | 0.0306 | 0.0426 |
| Pyramid (50 levels) | 532 | 1.8804 | 2.7703 |
| Mixed (100A, 200C) | 2,938 | 0.3403 | 0.8732 |
| Circular Avoidance | 142,142 | 0.0070 | 0.0104 |
| Conditional Deps | 336,236 | 0.0030 | 0.0039 |
| Array Dynamic Deps | 165,017 | 0.0061 | 0.0091 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 36,360 | 0.0275 | 0.1034 |
| Toggle Completion | 14,048 | 0.0712 | 0.1016 |
| Filter (Active/Completed) | 26,626 | 0.0376 | 0.0636 |
| Delete (50 from 100) | 29,366 | 0.0341 | 0.0484 |
| Complete Workflow | 27,211 | 0.0367 | 0.0639 |
| Stats with Auto-update | 30,408 | 0.0329 | 0.0691 |

---

### 3. Realistic-Benchmarks

#### Shopping Cart (E-commerce)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| E-commerce cart workflow | 49,878 | 0.0200 | 0.0339 |

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame | 22,147 | 0.0452 | 0.1574 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 3,650 | 0.2739 | 4.2396 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 35,884 | 0.0279 | 0.0641 |
| Form reset (no batch) | 51,817 | 0.0193 | 0.0351 |

> **Note**: The "no batch" case appears faster because it measures only the **scheduling cost** (updates are coalesced via microtask queue). The "batch" case includes **synchronous flush overhead**. Both result in the same Effect execution count (1 run). Use `batch()` when you need **guaranteed synchronous** completion.

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 14,251 | 0.0702 | 0.1688 |
