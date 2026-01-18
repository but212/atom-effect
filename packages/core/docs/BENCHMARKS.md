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

## Latest Results (v0.9.1)

**Date**: 2026-01-18  
**Environment**: Github Actions, Node.js 20.x, V8 Engine  
**Methodology Update**: Integrated **Automatic Group Update (Scheduler v0.9.1)**. Performance metrics now reflect true engine throughput by eliminating redundant microtask context switching.

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 4,692,568 | 0.0002 | 0.0003 |
| Create (Object) | 4,526,797 | 0.0002 | 0.0003 |
| Create 100 Atoms | 51,599 | 0.0194 | 0.0287 |
| Read (Value) | 11,859,162 | 0.0001 | 0.0001 |
| Read (Peek) | 17,411,077 | 0.0001 | 0.0001 |
| Read 100 Atoms | 366,989 | 0.0027 | 0.0027 |
| Write (Single) | 9,521,874 | 0.0001 | 0.0001 |
| Write (10 times) | 4,996,369 | 0.0002 | 0.0002 |
| Write 100 Atoms | 246,319 | 0.0041 | 0.0042 |
| Subscribe/Unsubscribe | 10,391,362 | 0.0001 | 0.0001 |
| Notify (1 Subscriber) | 3,631,957 | 0.0003 | 0.0004 |
| Notify (10 Subscribers) | 3,639,555 | 0.0003 | 0.0004 |
| Dispose | 4,539,418 | 0.0002 | 0.0003 |
| Dispose (with Subscribers) | 3,711,267 | 0.0003 | 0.0004 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,800,909 | 0.0006 | 0.0010 |
| Create (3 Deps) | 1,142,482 | 0.0009 | 0.0017 |
| Create Chain (100) | 7,395 | 0.1352 | 0.3284 |
| Read (Single Dep) | 6,120,929 | 0.0002 | 0.0002 |
| Read (Multiple) | 6,154,914 | 0.0002 | 0.0002 |
| Nested Computation | 6,136,798 | 0.0002 | 0.0002 |
| Recompute (Single Dep) | 583,089 | 0.0017 | 0.0021 |
| Recompute (Chain of 10) | 81,218 | 0.0123 | 0.0213 |
| No Recompute (Unchanged) | 5,335,078 | 0.0002 | 0.0002 |
| Lazy (Not Accessed) | 1,739,847 | 0.0006 | 0.0010 |
| Lazy (Accessed Once) | 537,303 | 0.0019 | 0.0024 |
| Lazy (Multiple Access) | 479,221 | 0.0021 | 0.0026 |
| Cache Invalidation | 577,942 | 0.0017 | 0.0030 |
| Diamond Invalidation | 219,416 | 0.0046 | 0.0092 |
| Dispose | 1,593,709 | 0.0006 | 0.0008 |
| Dispose Chain | 248,540 | 0.0040 | 0.0054 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 261,256 | 0.0038 | 0.0082 |
| Create (Multiple Deps) | 227,422 | 0.0044 | 0.0065 |
| Create 10 Effects | 27,972 | 0.0357 | 0.0601 |
| Execution (Dep Change) | 2,964,852 | 0.0003 | 0.0006 |
| Execution (Multiple) | 2,303,772 | 0.0004 | 0.0007 |
| With Computed Dep | 2,785,125 | 0.0004 | 0.0006 |
| Re-runs (10 times) | 991,140 | 0.0010 | 0.0013 |
| Multiple on Same Dep | 2,968,229 | 0.0003 | 0.0006 |
| With Cleanup | 245,939 | 0.0041 | 0.0062 |
| Cleanup on Dep Change | 3,132,702 | 0.0003 | 0.0005 |
| Dispose | 271,070 | 0.0037 | 0.0045 |
| Dispose (with Cleanup) | 263,960 | 0.0038 | 0.0068 |
| Dispose 10 Effects | 28,633 | 0.0349 | 0.0585 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 3,824,318 | 0.0003 | 0.0003 |
| Batch Update (10) | 2,378,996 | 0.0004 | 0.0007 |
| Batch Update (100) | 477,048 | 0.0021 | 0.0021 |
| Without Batch (10) | 1,159,668 | 0.0009 | 0.0012 |
| With Batch (10) | 190,474 | 0.0053 | 0.0060 |
| Nested Batch (2 levels) | 2,794,459 | 0.0004 | 0.0004 |
| Nested Batch (5 levels) | 1,388,321 | 0.0007 | 0.0008 |
| Batch with Computed | 245,951 | 0.0041 | 0.0079 |
| Batch with Diamond | 199,330 | 0.0050 | 0.0057 |
| Untracked Read (Single) | 5,764,534 | 0.0002 | 0.0002 |
| Untracked Read (Multiple) | 4,233,647 | 0.0002 | 0.0004 |
| Peek vs Value | 5,835,244 | 0.0002 | 0.0002 |
| Tracked (3 Deps) | 518,704 | 0.0019 | 0.0023 |
| Untracked (Ignores) | 4,733,206 | 0.0002 | 0.0002 |
| Partial Tracking | 438,682 | 0.0023 | 0.0028 |
| Nested Untracked | 2,556,997 | 0.0004 | 0.0004 |
| 100% Tracking | 389,123 | 0.0026 | 0.0030 |
| 50% Tracking | 413,067 | 0.0024 | 0.0029 |
| 0% Tracking | 4,416,718 | 0.0002 | 0.0003 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 836 | 1.1951 | 1.8626 |
| 1 to N (Fan Out 1000) | 735 | 1.3604 | 1.7827 |
| N to 1 (Fan In 1000) | 8,888 | 0.1125 | 0.2370 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 6,190 | 0.1615 | 0.3262 |
| Create/Dispose 1K Computeds | 2,187 | 0.4572 | 0.7845 |
| Create/Dispose 1K Effects | 591 | 1.6901 | 2.4800 |
| Rapid GC (10K Cycles) | 904 | 1.1058 | 1.2592 |
| Subscription Churn (1K) | 44,539 | 0.0225 | 0.1069 |
| Object Pooling (10K) | 18 | 53.1032 | 54.6978 |
| Weak Reference Cleanup (1K) | 2,160 | 0.4629 | 0.8596 |
| Effect Cleanup (1K) | 139 | 7.1455 | 8.2988 |
| Circular Reference Cleanup | 37,166 | 0.0269 | 0.0486 |
| Large State Tree (10K) | 983 | 1.0172 | 1.6952 |
| Memory Usage Monitoring | 182 | 5.4771 | 8.2880 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,138 | 0.2416 | 0.4160 |
| Sort (Name) | 4,688 | 0.2133 | 0.4008 |
| Sort (Salary) | 8,933 | 0.1119 | 0.1409 |
| Filter (Department) | 17,433 | 0.0574 | 0.0666 |
| Paginate (10/page) | 487,145 | 0.0021 | 0.0025 |
| Sort + Filter + Paginate | 687 | 1.4549 | 1.6071 |
| Update Single Row | 139,176 | 0.0072 | 0.0102 |
| Batch Update (100 Rows) | 1,353 | 0.7387 | 1.0101 |
| Select/Deselect Rows | 1,830 | 0.5464 | 0.8560 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,227 | 0.1215 | 0.2094 |
| Wide Fan-out (1→100) | 7,412 | 0.1349 | 0.2487 |
| Diamond Pattern | 35,727 | 0.0280 | 0.0373 |
| Pyramid (50 levels) | 13,229 | 0.0756 | 0.0962 |
| Mixed (100A, 200C) | 36,639 | 0.0273 | 0.0356 |
| Circular Avoidance | 202,876 | 0.0049 | 0.0056 |
| Conditional Deps | 429,932 | 0.0023 | 0.0027 |
| Array Dynamic Deps | 431,633 | 0.0023 | 0.0027 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 841,230 | 0.0012 | 0.0021 |
| Toggle Completion | 9,448 | 0.1058 | 0.1478 |
| Filter (Active/Completed) | 474,098 | 0.0021 | 0.0031 |
| Delete (50 from 100) | 42,054 | 0.0238 | 0.0479 |
| Complete Workflow | 178,021 | 0.0056 | 0.0115 |
| Stats with Auto-update | 570,944 | 0.0018 | 0.0028 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame | 111,234 | 0.0090 | 0.0177 |
| Updates per frame (batched) | 41,591 | 0.0240 | 0.0365 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 2,623 | 0.3811 | 2.2596 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 161,514 | 0.0062 | 0.0108 |
| Form reset (no batch) | 882,488 | 0.0011 | 0.0017 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 4,877 | 0.2050 | 0.4869 |
