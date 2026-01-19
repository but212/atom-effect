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

## Latest Results (v0.10.1)

**Date**: 2026-01-19  
**Environment**: Github Actions, Node.js 20.x, V8 Engine

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 6,324,631 | 0.0002 | 0.0003 |
| Create (Object) | 5,938,741 | 0.0002 | 0.0002 |
| Create 100 Atoms | 67,722 | 0.0148 | 0.0237 |
| Read (Value) | 11,717,323 | 0.0001 | 0.0001 |
| Read (Peek) | 17,620,596 | 0.0001 | 0.0001 |
| Read 100 Atoms | 344,756 | 0.0029 | 0.0058 |
| Write (Single) | 9,647,286 | 0.0001 | 0.0001 |
| Write (10 times) | 5,059,310 | 0.0002 | 0.0002 |
| Write 100 Atoms | 252,154 | 0.0040 | 0.0041 |
| Subscribe/Unsubscribe | 9,543,267 | 0.0001 | 0.0001 |
| Notify (1 Subscriber) | 3,043,909 | 0.0003 | 0.0005 |
| Notify (10 Subscribers) | 3,077,488 | 0.0003 | 0.0004 |
| Dispose | 5,966,421 | 0.0002 | 0.0002 |
| Dispose (with Subscribers) | 3,469,329 | 0.0003 | 0.0004 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,876,618 | 0.0005 | 0.0008 |
| Create (3 Deps) | 1,283,163 | 0.0008 | 0.0010 |
| Create Chain (100) | 7,441 | 0.1344 | 0.3121 |
| Read (Single Dep) | 5,995,540 | 0.0002 | 0.0002 |
| Read (Multiple) | 5,943,398 | 0.0002 | 0.0002 |
| Nested Computation | 5,920,000 | 0.0002 | 0.0002 |
| Recompute (Single Dep) | 574,376 | 0.0017 | 0.0021 |
| Recompute (Chain of 10) | 82,854 | 0.0121 | 0.0212 |
| No Recompute (Unchanged) | 5,659,858 | 0.0002 | 0.0002 |
| Lazy (Not Accessed) | 1,833,878 | 0.0005 | 0.0010 |
| Lazy (Accessed Once) | 539,485 | 0.0019 | 0.0022 |
| Lazy (Multiple Access) | 476,862 | 0.0021 | 0.0025 |
| Cache Invalidation | 559,553 | 0.0018 | 0.0022 |
| Diamond Invalidation | 229,565 | 0.0044 | 0.0050 |
| Dispose | 1,611,278 | 0.0006 | 0.0009 |
| Dispose Chain | 249,940 | 0.0040 | 0.0066 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 277,964 | 0.0036 | 0.0047 |
| Create (Multiple Deps) | 233,429 | 0.0043 | 0.0066 |
| Create 10 Effects | 29,090 | 0.0344 | 0.0482 |
| Execution (Dep Change) | 2,614,249 | 0.0004 | 0.0006 |
| Execution (Multiple) | 1,759,814 | 0.0006 | 0.0008 |
| With Computed Dep | 2,468,255 | 0.0004 | 0.0007 |
| Re-runs (10 times) | 755,434 | 0.0013 | 0.0020 |
| Multiple on Same Dep | 2,558,113 | 0.0004 | 0.0007 |
| With Cleanup | 241,164 | 0.0041 | 0.0060 |
| Cleanup on Dep Change | 2,719,775 | 0.0004 | 0.0006 |
| Dispose | 265,749 | 0.0038 | 0.0045 |
| Dispose (with Cleanup) | 268,101 | 0.0037 | 0.0047 |
| Dispose 10 Effects | 28,358 | 0.0353 | 0.0488 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 4,128,105 | 0.0002 | 0.0003 |
| Batch Update (10) | 2,546,409 | 0.0004 | 0.0004 |
| Batch Update (100) | 578,913 | 0.0017 | 0.0018 |
| Without Batch (10) | 842,396 | 0.0012 | 0.0016 |
| With Batch (10) | 168,252 | 0.0059 | 0.0082 |
| Nested Batch (2 levels) | 2,912,920 | 0.0003 | 0.0004 |
| Nested Batch (5 levels) | 1,366,641 | 0.0007 | 0.0011 |
| Batch with Computed | 235,672 | 0.0042 | 0.0051 |
| Batch with Diamond | 194,957 | 0.0051 | 0.0061 |
| Untracked Read (Single) | 5,806,703 | 0.0002 | 0.0002 |
| Untracked Read (Multiple) | 4,432,694 | 0.0002 | 0.0003 |
| Peek vs Value | 5,590,471 | 0.0002 | 0.0002 |
| Tracked (3 Deps) | 510,463 | 0.0020 | 0.0023 |
| Untracked (Ignores) | 4,752,482 | 0.0002 | 0.0002 |
| Partial Tracking | 419,079 | 0.0024 | 0.0028 |
| Nested Untracked | 2,461,858 | 0.0004 | 0.0004 |
| 100% Tracking | 385,048 | 0.0026 | 0.0030 |
| 50% Tracking | 387,135 | 0.0026 | 0.0044 |
| 0% Tracking | 4,633,023 | 0.0002 | 0.0002 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 840 | 1.1908 | 2.3427 |
| 1 to N (Fan Out 1000) | 724 | 1.3803 | 1.7423 |
| N to 1 (Fan In 1000) | 8,646 | 0.1157 | 0.2360 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 6,759 | 0.1480 | 0.2152 |
| Create/Dispose 1K Computeds | 1,943 | 0.5148 | 0.8253 |
| Create/Dispose 1K Effects | 569 | 1.7565 | 2.4931 |
| Rapid GC (10K Cycles) | 1,090 | 0.9172 | 1.0224 |
| Subscription Churn (1K) | 41,966 | 0.0238 | 0.1061 |
| Object Pooling (10K) | 20 | 51.2752 | 57.4842 |
| Weak Reference Cleanup (1K) | 2,092 | 0.4781 | 0.7712 |
| Effect Cleanup (1K) | 137 | 7.2944 | 8.0231 |
| Circular Reference Cleanup | 42,302 | 0.0236 | 0.0328 |
| Large State Tree (10K) | 932 | 1.0733 | 1.7418 |
| Memory Usage Monitoring | 183 | 5.4628 | 5.9268 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,200 | 0.2381 | 0.4387 |
| Sort (Name) | 4,875 | 0.2051 | 0.3576 |
| Sort (Salary) | 8,983 | 0.1113 | 0.1316 |
| Filter (Department) | 17,410 | 0.0574 | 0.0701 |
| Paginate (10/page) | 464,434 | 0.0022 | 0.0026 |
| Sort + Filter + Paginate | 646 | 1.5472 | 1.9587 |
| Update Single Row | 137,399 | 0.0073 | 0.0101 |
| Batch Update (100 Rows) | 1,304 | 0.7668 | 0.9077 |
| Select/Deselect Rows | 1,824 | 0.5482 | 0.8430 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,492 | 0.1178 | 0.2286 |
| Wide Fan-out (1→100) | 7,452 | 0.1342 | 0.1544 |
| Diamond Pattern | 35,334 | 0.0283 | 0.0380 |
| Pyramid (50 levels) | 14,061 | 0.0711 | 0.0879 |
| Mixed (100A, 200C) | 36,593 | 0.0273 | 0.0357 |
| Circular Avoidance | 199,297 | 0.0050 | 0.0062 |
| Conditional Deps | 403,672 | 0.0025 | 0.0029 |
| Array Dynamic Deps | 403,813 | 0.0025 | 0.0029 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 858,172 | 0.0012 | 0.0021 |
| Toggle Completion | 9,479 | 0.1055 | 0.1312 |
| Filter (Active/Completed) | 456,748 | 0.0022 | 0.0032 |
| Delete (50 from 100) | 43,876 | 0.0228 | 0.0454 |
| Complete Workflow | 177,539 | 0.0056 | 0.0114 |
| Stats with Auto-update | 538,406 | 0.0019 | 0.0031 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame | 75,173 | 0.0133 | 0.0227 |
| Updates per frame (batched) | 32,526 | 0.0307 | 0.0428 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 2,690 | 0.3718 | 2.1768 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 144,026 | 0.0069 | 0.0114 |
| Form reset (no batch) | 643,363 | 0.0016 | 0.0025 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 4,805 | 0.2081 | 0.4692 |
