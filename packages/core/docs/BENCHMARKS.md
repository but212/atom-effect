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

## Latest Results (v0.8.4)

**Date**: 2026-01-18  
**Environment**: Github Actions, Node.js 20.x, V8 Engine  
**Methdology Update**: Benchmarks now isolate object creation and disable infinite loop detection (`maxExecutions: Infinity`) to measure pure engine throughput without artificial throttling.

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 4,949,442 | 0.0002 | 0.0003 |
| Create (Object) | 4,713,087 | 0.0002 | 0.0003 |
| Create 100 Atoms | 51,045 | 0.0196 | 0.0290 |
| Read (Value) | 11,755,207 | 0.0001 | 0.0001 |
| Read (Peek) | 18,072,049 | 0.0001 | 0.0001 |
| Read 100 Atoms | 356,885 | 0.0028 | 0.0043 |
| Write (Single) | 9,316,358 | 0.0001 | 0.0001 |
| Write (10 times) | 4,780,984 | 0.0002 | 0.0002 |
| Write 100 Atoms | 247,356 | 0.0040 | 0.0047 |
| Subscribe/Unsubscribe | 10,649,312 | 0.0001 | 0.0001 |
| Notify (1 Subscriber) | 3,417,571 | 0.0003 | 0.0005 |
| Notify (10 Subscribers) | 3,626,319 | 0.0003 | 0.0005 |
| Dispose | 4,826,532 | 0.0002 | 0.0004 |
| Dispose (with Subscribers) | 3,578,795 | 0.0003 | 0.0005 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,749,877 | 0.0006 | 0.0010 |
| Create (3 Deps) | 1,134,598 | 0.0009 | 0.0012 |
| Create Chain (100) | 7,522 | 0.1329 | 0.2988 |
| Read (Single Dep) | 5,887,681 | 0.0002 | 0.0002 |
| Read (Multiple) | 5,897,523 | 0.0002 | 0.0003 |
| Nested Computation | 6,016,155 | 0.0002 | 0.0002 |
| Recompute (Single Dep) | 555,520 | 0.0018 | 0.0024 |
| Recompute (Chain of 10) | 79,092 | 0.0126 | 0.0223 |
| No Recompute (Unchanged) | 5,242,864 | 0.0002 | 0.0002 |
| Lazy (Not Accessed) | 1,665,086 | 0.0006 | 0.0011 |
| Lazy (Accessed Once) | 531,312 | 0.0019 | 0.0024 |
| Lazy (Multiple Access) | 474,355 | 0.0021 | 0.0028 |
| Cache Invalidation | 557,983 | 0.0018 | 0.0024 |
| Diamond Invalidation | 222,201 | 0.0045 | 0.0080 |
| Dispose | 1,516,777 | 0.0007 | 0.0009 |
| Dispose Chain | 238,828 | 0.0042 | 0.0066 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 467,948 | 0.0021 | 0.0038 |
| Create (Multiple Deps) | 351,128 | 0.0028 | 0.0052 |
| Create 10 Effects | 51,553 | 0.0194 | 0.0369 |
| Execution (Dep Change) | 4,567,748 | 0.0002 | 0.0004 |
| Execution (Multiple) | 3,216,060 | 0.0003 | 0.0005 |
| With Computed Dep | 4,944,030 | 0.0002 | 0.0003 |
| Re-runs (10 times) | 1,283,822 | 0.0008 | 0.0010 |
| Multiple on Same Dep | 4,489,051 | 0.0002 | 0.0003 |
| With Cleanup | 380,405 | 0.0026 | 0.0054 |
| Cleanup on Dep Change | 4,717,367 | 0.0002 | 0.0004 |
| Dispose | 439,109 | 0.0023 | 0.0043 |
| Dispose (with Cleanup) | 436,569 | 0.0023 | 0.0043 |
| Dispose 10 Effects | 48,795 | 0.0205 | 0.0343 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 3,967,868 | 0.0003 | 0.0003 |
| Batch Update (10) | 2,623,933 | 0.0004 | 0.0005 |
| Batch Update (100) | 561,326 | 0.0018 | 0.0019 |
| Without Batch (10) | 1,527,436 | 0.0007 | 0.0008 |
| With Batch (10) | 148,882 | 0.0067 | 0.0101 |
| Nested Batch (2 levels) | 2,892,393 | 0.0003 | 0.0004 |
| Nested Batch (5 levels) | 1,298,809 | 0.0008 | 0.0012 |
| Batch with Computed | 244,636 | 0.0041 | 0.0078 |
| Batch with Diamond | 197,407 | 0.0051 | 0.0065 |
| Untracked Read (Single) | 6,008,969 | 0.0002 | 0.0002 |
| Untracked Read (Multiple) | 4,562,223 | 0.0002 | 0.0003 |
| Peek vs Value | 5,798,230 | 0.0002 | 0.0002 |
| Tracked (3 Deps) | 526,291 | 0.0019 | 0.0027 |
| Untracked (Ignores) | 4,451,496 | 0.0002 | 0.0003 |
| Partial Tracking | 426,520 | 0.0023 | 0.0031 |
| Nested Untracked | 2,574,562 | 0.0004 | 0.0005 |
| 100% Tracking | 397,703 | 0.0025 | 0.0031 |
| 50% Tracking | 418,403 | 0.0024 | 0.0030 |
| 0% Tracking | 4,769,875 | 0.0002 | 0.0002 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 869 | 1.1501 | 1.9262 |
| 1 to N (Fan Out 1000) | 740 | 1.3509 | 1.9332 |
| N to 1 (Fan In 1000) | 8,655 | 0.1155 | 0.2445 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 5,723 | 0.1747 | 0.3745 |
| Create/Dispose 1K Computeds | 1,594 | 0.6271 | 1.0397 |
| Create/Dispose 1K Effects | 492 | 2.0285 | 3.9642 |
| Rapid GC (10K Cycles) | 896 | 1.1161 | 1.3411 |
| Subscription Churn (1K) | 44,115 | 0.0227 | 0.1110 |
| Object Pooling (10K) | 19 | 51.7408 | 54.9672 |
| Weak Reference Cleanup (1K) | 2,170 | 0.4608 | 0.7892 |
| Effect Cleanup (1K) | 132 | 7.5530 | 11.1148 |
| Circular Reference Cleanup | 36,004 | 0.0278 | 0.0390 |
| Large State Tree (10K) | 985 | 1.0151 | 1.6662 |
| Memory Usage Monitoring | 177 | 5.6324 | 6.1799 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,023 | 0.2486 | 0.4430 |
| Sort (Name) | 4,801 | 0.2082 | 0.3977 |
| Sort (Salary) | 8,848 | 0.1130 | 0.1357 |
| Filter (Department) | 18,458 | 0.0542 | 0.0652 |
| Paginate (10/page) | 479,533 | 0.0021 | 0.0027 |
| Sort + Filter + Paginate | 667 | 1.4970 | 1.6087 |
| Update Single Row | 130,418 | 0.0077 | 0.0142 |
| Batch Update (100 Rows) | 1,363 | 0.7335 | 0.8968 |
| Select/Deselect Rows | 1,835 | 0.5447 | 0.8608 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,737 | 0.1145 | 0.2210 |
| Wide Fan-out (1→100) | 7,695 | 0.1299 | 0.1605 |
| Diamond Pattern | 36,156 | 0.0277 | 0.0377 |
| Pyramid (50 levels) | 13,954 | 0.0717 | 0.0899 |
| Mixed (100A, 200C) | 39,198 | 0.0255 | 0.0342 |
| Circular Avoidance | 201,951 | 0.0050 | 0.0065 |
| Conditional Deps | 445,277 | 0.0022 | 0.0028 |
| Array Dynamic Deps | 448,671 | 0.0022 | 0.0029 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 751,337 | 0.0013 | 0.0028 |
| Toggle Completion | 9,384 | 0.1066 | 0.1468 |
| Filter (Active/Completed) | 479,202 | 0.0021 | 0.0029 |
| Delete (50 from 100) | 43,191 | 0.0232 | 0.0462 |
| Complete Workflow | 186,102 | 0.0054 | 0.0111 |
| Stats with Auto-update | 628,834 | 0.0016 | 0.0026 |

---

### 3. Realistic-Benchmarks

#### Shopping Cart (E-commerce)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| E-commerce cart workflow | 2,252,548 | 0.0004 | 0.0008 |

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame | 105,792 | 0.0095 | 0.0187 |
| Updates per frame (batched) | 39,495 | 0.0253 | 0.0384 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 3,616 | 0.2765 | 3.9304 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 134,744 | 0.0074 | 0.0151 |
| Form reset (no batch) | 1,694,228 | 0.0006 | 0.0010 |

> **Note**: The "no batch" case appears faster because it measures only the **scheduling cost** (updates are coalesced via microtask queue). The "batch" case includes **synchronous flush overhead**. Both result in the same Effect execution count (1 run). Use `batch()` when you need **guaranteed synchronous** completion.

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 11,480 | 0.0871 | 0.2008 |
