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

## Latest Results (v0.3.0)

**Date**: 2026-01-09  
**Environment**: GitHub Actions (`ubuntu-latest`), Node.js 20.x, V8 Engine

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 4,943,419 | 0.0002 | 0.0005 |
| Create (Object) | 4,757,323 | 0.0002 | 0.0005 |
| Create 100 Atoms | 53,122 | 0.0188 | 0.0272 |
| Read (Value) | 4,075,639 | 0.0002 | 0.0006 |
| Read (Peek) | 4,865,005 | 0.0002 | 0.0005 |
| Write (Single) | 4,528,597 | 0.0002 | 0.0005 |
| Write (10 times) | 2,721,916 | 0.0004 | 0.0007 |
| Subscribe/Unsubscribe | 3,822,804 | 0.0003 | 0.0006 |
| Notify (1 Subscriber) | 2,210,603 | 0.0005 | 0.0009 |
| Notify (10 Subscribers) | 1,330,812 | 0.0008 | 0.0014 |
| Dispose | 4,775,302 | 0.0002 | 0.0005 |
| Dispose (with Subscribers) | 3,553,582 | 0.0003 | 0.0006 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,712,685 | 0.0006 | 0.0012 |
| Create (3 Deps) | 1,141,028 | 0.0009 | 0.0015 |
| Create Chain (100) | 8,202 | 0.1219 | 0.2694 |
| Read (Single Dep) | 699,525 | 0.0014 | 0.0024 |
| Read (Multiple) | 498,191 | 0.0020 | 0.0031 |
| Nested Computation | 371,318 | 0.0027 | 0.0041 |
| Recompute (Single Dep) | 565,927 | 0.0018 | 0.0024 |
| Recompute (Chain of 10) | 87,315 | 0.0115 | 0.0186 |
| No Recompute (Unchanged) | 639,454 | 0.0016 | 0.0024 |
| Lazy (Not Accessed) | 1,663,589 | 0.0006 | 0.0012 |
| Lazy (Accessed Once) | 719,785 | 0.0014 | 0.0020 |
| Cache Invalidation | 569,353 | 0.0018 | 0.0025 |
| Diamond Invalidation | 237,543 | 0.0042 | 0.0056 |
| Dispose | 1,449,065 | 0.0007 | 0.0014 |
| Dispose Chain | 235,368 | 0.0042 | 0.0067 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 619,348 | 0.0016 | 0.0031 |
| Create (Multiple Deps) | 411,289 | 0.0024 | 0.0042 |
| Create 10 Effects | 70,525 | 0.0142 | 0.0258 |
| Execution (Dep Change) | 514,657 | 0.0019 | 0.0033 |
| Execution (Multiple) | 455,031 | 0.0022 | 0.0035 |
| With Computed Dep | 308,028 | 0.0032 | 0.0050 |
| Re-runs (10 times) | 438,161 | 0.0023 | 0.0036 |
| Multiple on Same Dep | 218,448 | 0.0046 | 0.0075 |
| With Cleanup | 505,813 | 0.0020 | 0.0032 |
| Cleanup on Dep Change | 484,882 | 0.0021 | 0.0033 |
| Dispose | 631,749 | 0.0016 | 0.0028 |
| Dispose (with Cleanup) | 616,676 | 0.0016 | 0.0027 |
| Dispose 10 Effects | 70,082 | 0.0143 | 0.0308 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 1,923,937 | 0.0005 | 0.0011 |
| Batch Update (10) | 349,563 | 0.0029 | 0.0041 |
| Batch Update (100) | 48,801 | 0.0205 | 0.0296 |
| Without Batch (10) | 71,429 | 0.0140 | 0.0239 |
| With Batch (10) | 56,323 | 0.0178 | 0.0284 |
| Nested Batch (2 levels) | 1,788,330 | 0.0006 | 0.0010 |
| Nested Batch (5 levels) | 479,886 | 0.0021 | 0.0028 |
| Batch with Computed | 303,759 | 0.0033 | 0.0048 |
| Batch with Diamond | 267,570 | 0.0037 | 0.0049 |
| Untracked Read (Single) | 3,292,253 | 0.0003 | 0.0007 |
| Untracked Read (Multiple) | 1,578,163 | 0.0006 | 0.0012 |
| Peek vs Value | 3,271,451 | 0.0003 | 0.0007 |
| Tracked (3 Deps) | 426,551 | 0.0023 | 0.0037 |
| Untracked (Ignores) | 552,385 | 0.0018 | 0.0027 |
| Partial Tracking | 389,876 | 0.0026 | 0.0034 |
| Nested Untracked | 1,196,296 | 0.0008 | 0.0015 |
| 100% Tracking | 171,439 | 0.0058 | 0.0091 |
| 50% Tracking | 172,411 | 0.0058 | 0.0077 |
| 0% Tracking | 250,731 | 0.0040 | 0.0053 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 5,326 | 0.1878 | 0.4199 |
| Create/Dispose 1K Computeds | 2,051 | 0.4875 | 1.0676 |
| Create/Dispose 1K Effects | 637 | 1.5692 | 3.2701 |
| Rapid GC (10K Cycles) | 826 | 1.2096 | 1.4354 |
| Subscription Churn (1K) | 38,077 | 0.0263 | 0.1125 |
| Object Pooling (10K) | 21 | 45.9063 | 48.4296 |
| Weak Reference Cleanup (1K) | 2,108 | 0.4742 | 1.0236 |
| Effect Cleanup (1K) | 151 | 6.5900 | 8.5622 |
| Circular Reference Cleanup | 34,954 | 0.0286 | 0.0403 |
| Large State Tree (10K) | 915 | 1.0928 | 1.9560 |
| Memory Usage Monitoring | 203 | 4.9109 | 6.1394 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,530 | 0.2207 | 0.5108 |
| Sort (Name) | 1,426 | 0.7009 | 8.5128 |
| Sort (Salary) | 1,599 | 0.6252 | 11.6355 |
| Filter (Department) | 1,860 | 0.5375 | 12.5638 |
| Paginate (10/page) | 2,043 | 0.4894 | 12.2948 |
| Sort + Filter + Paginate | 649 | 1.5389 | 8.3982 |
| Update Single Row | 4,435 | 0.2254 | 0.6245 |
| Batch Update (100 Rows) | 1,497 | 0.6678 | 1.1011 |
| Select/Deselect Rows | 1,880 | 0.5318 | 0.8787 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 4,116 | 0.2429 | 6.2315 |
| Wide Fan-out (1→100) | 8,433 | 0.1186 | 0.3221 |
| Diamond Pattern | 34,344 | 0.0291 | 0.0413 |
| Pyramid (50 levels) | 246 | 4.0639 | 20.1496 |
| Mixed (100A, 200C) | 3,349 | 0.2985 | 1.1273 |
| Circular Avoidance | 150,985 | 0.0066 | 0.0093 |
| Conditional Deps | 386,669 | 0.0026 | 0.0036 |
| Array Dynamic Deps | 175,056 | 0.0057 | 0.0077 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 36,199 | 0.0276 | 0.0971 |
| Toggle Completion | 14,757 | 0.0678 | 0.1024 |
| Filter (Active/Completed) | 25,708 | 0.0389 | 0.0688 |
| Delete (50 from 100) | 29,108 | 0.0344 | 0.0511 |
| Complete Workflow | 26,439 | 0.0378 | 0.0574 |
| Stats with Auto-update | 30,148 | 0.0332 | 0.0703 |
