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

**Date**: 2026-01-25  
**Environment**: GitHub Actions, Node.js 20.x, V8 Engine  

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 13,334 | 0.0750 | 0.1398 |
| Create 1000 Atoms (Objects) | 13,202 | 0.0757 | 0.1382 |
| Read 1000 Atoms (Value) | 36,894 | 0.0271 | 0.0345 |
| Read 1000 Atoms (Peek) | 613,325 | 0.0016 | 0.0017 |
| Write 1000 Atoms | 342,902 | 0.0029 | 0.0030 |
| Subscribe/Unsubscribe (x100) | 280,133 | 0.0036 | 0.0046 |
| Notify 1 Subscriber (x1000) | 11,601 | 0.0862 | 0.1127 |
| Untracked Read (x1000) | 37,625 | 0.0266 | 0.0344 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 2,173,760 | 0.0005 | 0.0008 |
| Create (3 Deps) | 1,485,459 | 0.0007 | 0.0009 |
| Create Chain (100) | 9,084 | 0.1101 | 0.2488 |
| Read (Single Dep) | 6,878,416 | 0.0001 | 0.0002 |
| Read (Multiple) | 6,750,357 | 0.0001 | 0.0002 |
| Nested Computation | 6,250,968 | 0.0002 | 0.0003 |
| Recompute (Single Dep) | 584,391 | 0.0017 | 0.0021 |
| Recompute (Chain of 10) | 87,832 | 0.0114 | 0.0205 |
| No Recompute (Unchanged) | 6,424,458 | 0.0002 | 0.0002 |
| Lazy (Not Accessed) | 2,115,083 | 0.0005 | 0.0006 |
| Lazy (Accessed Once) | 593,999 | 0.0017 | 0.0027 |
| Lazy (Multiple Access) | 555,648 | 0.0018 | 0.0021 |
| Cache Invalidation | 583,440 | 0.0017 | 0.0020 |
| Diamond Invalidation | 237,921 | 0.0042 | 0.0051 |
| Dispose | 1,827,875 | 0.0005 | 0.0008 |
| Dispose Chain | 295,162 | 0.0034 | 0.0039 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 298,906 | 0.0033 | 0.0054 |
| Create (Multiple Deps) | 258,955 | 0.0039 | 0.0048 |
| Create 10 Effects | 31,212 | 0.0320 | 0.0533 |
| Execution (Dep Change) | 2,563,536 | 0.0004 | 0.0006 |
| Execution (Multiple) | 1,676,713 | 0.0006 | 0.0009 |
| With Computed | 2,442,232 | 0.0004 | 0.0007 |
| Re-runs (10 times) | 685,387 | 0.0015 | 0.0018 |
| Multiple on Same Dep | 2,515,233 | 0.0004 | 0.0007 |
| With Cleanup | 262,924 | 0.0038 | 0.0050 |
| Cleanup on Dep Change | 2,575,599 | 0.0004 | 0.0006 |
| Dispose | 295,209 | 0.0034 | 0.0041 |
| Dispose (with Cleanup) | 290,900 | 0.0034 | 0.0042 |
| Dispose 10 Effects | 30,651 | 0.0326 | 0.0486 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 3,247,342 | 0.0003 | 0.0003 |
| Batch Update (10) | 1,651,030 | 0.0006 | 0.0007 |
| Batch Update (100) | 259,260 | 0.0039 | 0.0039 |
| Without Batch (10) | 713,723 | 0.0014 | 0.0018 |
| With Batch (10) | 166,612 | 0.0060 | 0.0067 |
| Nested Batch (2 levels) | 2,424,027 | 0.0004 | 0.0005 |
| Nested Batch (5 levels) | 1,363,966 | 0.0007 | 0.0008 |
| Batch with Computed | 231,172 | 0.0043 | 0.0049 |
| Batch with Diamond | 200,936 | 0.0050 | 0.0055 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 887 | 1.1278 | 1.8744 |
| 1 to N (Fan Out 1000) | 807 | 1.2395 | 1.5940 |
| N to 1 (Fan In 1000) | 15,288 | 0.0654 | 0.1098 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 6,472 | 0.1545 | 0.2247 |
| Create/Dispose 1K Computeds | 2,352 | 0.4251 | 0.7917 |
| Create/Dispose 1K Effects | 635 | 1.5739 | 2.1363 |
| Rapid GC (10K Cycles) | 1,033 | 0.9685 | 1.0860 |
| Subscription Churn (1K) | 29,618 | 0.0338 | 0.1159 |
| Object Pooling (10K) | 17 | 58.4160 | 63.5026 |
| Weak Reference Cleanup (1K) | 2,339 | 0.4276 | 0.8140 |
| Effect Cleanup (1K) | 132 | 7.5986 | 8.5006 |
| Circular Reference Cleanup | 35,636 | 0.0281 | 0.0380 |
| Large State Tree (10K) | 752 | 1.3302 | 2.0301 |
| Memory Usage Monitoring | 159 | 6.2884 | 6.7979 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,379 | 0.2284 | 0.4225 |
| [Atom] Initialize | 4,413 | 0.2266 | 0.4192 |
| [Vanilla] Sort (Name) | 4,241 | 0.2358 | 0.2567 |
| [Atom] Sort (Name) | 1,972 | 0.5070 | 0.6386 |
| [Vanilla] Filter (Department) | 508,584 | 0.0020 | 0.0024 |
| [Atom] Filter (Department) | 24,211 | 0.0413 | 0.0518 |
| [Vanilla] Sort + Filter + Paginate | 4,380 | 0.2283 | 0.2548 |
| [Atom] Sort + Filter + Paginate | 1,964 | 0.5091 | 0.5730 |
| Select/Deselect Rows | 1,888 | 0.5297 | 0.8146 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 9,320 | 0.1073 | 0.1437 |
| Wide Fan-out (1→100) | 8,370 | 0.1195 | 0.1436 |
| Diamond Pattern | 39,270 | 0.0255 | 0.0351 |
| Pyramid (50 levels) | 15,557 | 0.0643 | 0.0776 |
| Mixed (100A, 200C) | 46,627 | 0.0214 | 0.0301 |
| Circular Avoidance | 221,724 | 0.0045 | 0.0052 |
| Conditional Deps | 432,175 | 0.0023 | 0.0027 |
| Array Dynamic Deps | 436,554 | 0.0023 | 0.0026 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 841,204 | 0.0012 | 0.0022 |
| Toggle Completion | 9,281 | 0.1077 | 0.1350 |
| Filter (Active/Completed) | 474,209 | 0.0021 | 0.0033 |
| Delete (50 from 100) | 43,012 | 0.0232 | 0.0461 |
| Complete Workflow | 177,978 | 0.0056 | 0.0117 |
| Stats with Auto-update | 521,558 | 0.0019 | 0.0035 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 69,199 | 0.0145 | 0.0235 |
| Updates per frame (100 atoms, batched) | 29,776 | 0.0336 | 0.0459 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 3,737 | 0.2676 | 0.5702 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 134,675 | 0.0074 | 0.0155 |
| Form reset (no batch) | 486,397 | 0.0021 | 0.0030 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 740,561 | 0.0014 | 0.0019 |
