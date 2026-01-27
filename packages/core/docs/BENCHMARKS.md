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

## Latest Results (v0.13.0)

**Date**: 2026-01-27  
**Environment**: GitHub Actions, Node.js 20.x, V8 Engine  

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 10,727 | 0.0932 | 0.1642 |
| Create 1000 Atoms (Objects) | 11,136 | 0.0898 | 0.1599 |
| Read 1000 Atoms (Value) | 32,781 | 0.0305 | 0.0383 |
| Read 1000 Atoms (Peek) | 600,375 | 0.0017 | 0.0018 |
| Write 1000 Atoms | 552,425 | 0.0018 | 0.0019 |
| Subscribe/Unsubscribe (x100) | 177,393 | 0.0056 | 0.0072 |
| Notify 1 Subscriber (x1000) | 8,360 | 0.1196 | 0.1367 |
| Untracked Read (x1000) | 33,625 | 0.0297 | 0.0376 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 3,224,160 | 0.0003 | 0.0004 |
| Create (3 Deps) | 1,933,750 | 0.0005 | 0.0006 |
| Create Chain (100) | 9,219 | 0.1085 | 0.2245 |
| Read (Single Dep) | 13,491,270 | 0.0001 | 0.0001 |
| Read (Multiple) | 13,656,150 | 0.0001 | 0.0001 |
| Nested Computation | 13,732,820 | 0.0001 | 0.0001 |
| Recompute (Single Dep) | 600,241 | 0.0017 | 0.0021 |
| Recompute (Chain of 10) | 94,273 | 0.0106 | 0.0191 |
| No Recompute (Unchanged) | 13,541,060 | 0.0001 | 0.0001 |
| Lazy (Not Accessed) | 3,146,620 | 0.0003 | 0.0004 |
| Lazy (Accessed Once) | 611,749 | 0.0016 | 0.0029 |
| Lazy (Multiple Access) | 573,338 | 0.0017 | 0.0022 |
| Cache Invalidation | 585,640 | 0.0017 | 0.0029 |
| Diamond Invalidation | 256,767 | 0.0039 | 0.0046 |
| Dispose | 1,978,850 | 0.0005 | 0.0006 |
| Dispose Chain | 241,850 | 0.0041 | 0.0074 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 318,022 | 0.0031 | 0.0055 |
| Create (Multiple Deps) | 270,778 | 0.0037 | 0.0045 |
| Create 10 Effects | 33,693 | 0.0297 | 0.0432 |
| Execution (Dep Change) | 9,391,010 | 0.0001 | 0.0001 |
| Execution (Multiple) | 4,269,310 | 0.0002 | 0.0003 |
| With Computed Dep | 9,323,040 | 0.0001 | 0.0001 |
| Re-runs (10 times) | 681,312 | 0.0015 | 0.0018 |
| Multiple on Same Dep | 9,447,950 | 0.0001 | 0.0001 |
| With Cleanup | 279,791 | 0.0036 | 0.0042 |
| Cleanup on Dep Change | 9,471,060 | 0.0001 | 0.0001 |
| Dispose | 309,710 | 0.0032 | 0.0042 |
| Dispose (with Cleanup) | 304,414 | 0.0033 | 0.0056 |
| Dispose 10 Effects | 32,985 | 0.0303 | 0.0540 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 4,886,660 | 0.0002 | 0.0003 |
| Batch Update (10) | 2,028,440 | 0.0005 | 0.0006 |
| Batch Update (100) | 262,209 | 0.0038 | 0.0042 |
| Without Batch (10) | 742,183 | 0.0013 | 0.0018 |
| With Batch (10) | 178,281 | 0.0056 | 0.0071 |
| Nested Batch (2 levels) | 3,460,060 | 0.0003 | 0.0004 |
| Nested Batch (5 levels) | 1,701,120 | 0.0006 | 0.0008 |
| Batch with Computed | 245,004 | 0.0041 | 0.0049 |
| Batch with Diamond | 220,245 | 0.0045 | 0.0053 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 885 | 1.1294 | 1.9179 |
| 1 to N (Fan Out 1000) | 828 | 1.2075 | 1.5904 |
| N to 1 (Fan In 1000) | 14,164 | 0.0706 | 0.1374 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 4,283 | 0.2335 | 0.4019 |
| Create/Dispose 1K Computeds | 2,088 | 0.4788 | 0.6662 |
| Create/Dispose 1K Effects | 757 | 1.3215 | 1.8317 |
| Rapid GC (10K Cycles) | 565 | 1.7691 | 1.9415 |
| Subscription Churn (1K) | 30,494 | 0.0328 | 0.1196 |
| Object Pooling (10K) | 17 | 59.8746 | 61.9781 |
| Weak Reference Cleanup (1K) | 2,076 | 0.4817 | 0.6533 |
| Effect Cleanup (1K) | 136 | 7.3564 | 8.1813 |
| Circular Reference Cleanup | 22,136 | 0.0452 | 0.0573 |
| Large State Tree (10K) | 750 | 1.3334 | 2.0355 |
| Memory Usage Monitoring | 161 | 6.2055 | 6.7759 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,454 | 0.2245 | 0.4283 |
| [Atom] Initialize | 4,584 | 0.2181 | 0.4434 |
| [Vanilla] Sort (Name) | 3,890 | 0.2571 | 0.2914 |
| [Atom] Sort (Name) | 1,900 | 0.5262 | 0.7663 |
| [Vanilla] Filter (Department) | 483,471 | 0.0021 | 0.0031 |
| [Atom] Filter (Department) | 23,678 | 0.0422 | 0.0516 |
| [Vanilla] Sort + Filter + Paginate | 4,296 | 0.2328 | 0.2671 |
| [Atom] Sort + Filter + Paginate | 1,900 | 0.5264 | 0.7730 |
| Select/Deselect Rows | 1,827 | 0.5473 | 0.8967 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 10,015 | 0.0998 | 0.1796 |
| Wide Fan-out (1→100) | 8,818 | 0.1134 | 0.1375 |
| Diamond Pattern | 41,655 | 0.0240 | 0.0335 |
| Pyramid (50 levels) | 16,604 | 0.0602 | 0.0737 |
| Mixed (100A, 200C) | 46,051 | 0.0217 | 0.0300 |
| Circular Avoidance | 237,755 | 0.0042 | 0.0064 |
| Conditional Deps | 450,709 | 0.0022 | 0.0031 |
| Array Dynamic Deps | 455,849 | 0.0022 | 0.0038 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 795,674 | 0.0013 | 0.0023 |
| Toggle Completion | 9,258 | 0.1080 | 0.1237 |
| Filter (Active/Completed) | 487,820 | 0.0020 | 0.0029 |
| Delete (50 from 100) | 41,643 | 0.0240 | 0.0480 |
| Complete Workflow | 168,909 | 0.0059 | 0.0122 |
| Stats with Auto-update | 545,046 | 0.0018 | 0.0032 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 75,661 | 0.0132 | 0.0217 |
| Updates per frame (100 atoms, batched) | 29,783 | 0.0336 | 0.0557 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 3,822 | 0.2616 | 0.6046 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 144,942 | 0.0069 | 0.0150 |
| Form reset (no batch) | 523,057 | 0.0019 | 0.0029 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 708,655 | 0.0014 | 0.0021 |
