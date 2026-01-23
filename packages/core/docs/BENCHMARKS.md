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

**Date**: 2026-01-23  
**Environment**: GitHub Actions, Node.js 20.x, V8 Engine  

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 11,835 | 0.0845 | 0.1923 |
| Create 1000 Atoms (Objects) | 11,577 | 0.0864 | 0.1945 |
| Read 1000 Atoms (Value) | 38,038 | 0.0263 | 0.0324 |
| Read 1000 Atoms (Peek) | 621,509 | 0.0016 | 0.0022 |
| Write 1000 Atoms | 366,275 | 0.0027 | 0.0033 |
| Subscribe/Unsubscribe (x100) | 229,832 | 0.0044 | 0.0064 |
| Notify 1 Subscriber (x1000) | 15,418 | 0.0649 | 0.0805 |
| Untracked Read (x1000) | 36,415 | 0.0275 | 0.0333 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 2,167,077 | 0.0005 | 0.0010 |
| Create (3 Deps) | 1,477,244 | 0.0007 | 0.0013 |
| Create Chain (100) | 8,977 | 0.1114 | 0.2147 |
| Read (Single Dep) | 6,745,110 | 0.0001 | 0.0003 |
| Read (Multiple) | 6,631,756 | 0.0002 | 0.0003 |
| Nested Computation | 6,449,671 | 0.0002 | 0.0003 |
| Recompute (Single Dep) | 589,464 | 0.0017 | 0.0027 |
| Recompute (Chain of 10) | 90,573 | 0.0110 | 0.0163 |
| No Recompute (Unchanged) | 6,291,656 | 0.0002 | 0.0003 |
| Lazy (Not Accessed) | 2,093,050 | 0.0005 | 0.0009 |
| Lazy (Accessed Once) | 622,651 | 0.0016 | 0.0022 |
| Lazy (Multiple Access) | 566,336 | 0.0018 | 0.0024 |
| Cache Invalidation | 587,388 | 0.0017 | 0.0026 |
| Diamond Invalidation | 244,712 | 0.0041 | 0.0058 |
| Dispose | 1,791,764 | 0.0006 | 0.0011 |
| Dispose Chain | 261,677 | 0.0038 | 0.0055 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 271,696 | 0.0037 | 0.0060 |
| Create (Multiple Deps) | 220,879 | 0.0045 | 0.0106 |
| Create 10 Effects | 27,868 | 0.0359 | 0.0470 |
| Execution (Dep Change) | 2,459,887 | 0.0004 | 0.0009 |
| Execution (Multiple) | 1,744,981 | 0.0006 | 0.0011 |
| With Computed Dep | 2,337,930 | 0.0004 | 0.0010 |
| Re-runs (10 times) | 742,620 | 0.0013 | 0.0020 |
| Multiple on Same Dep | 2,143,608 | 0.0005 | 0.0009 |
| With Cleanup | 237,154 | 0.0042 | 0.0058 |
| Cleanup on Dep Change | 2,446,121 | 0.0004 | 0.0009 |
| Dispose | 259,740 | 0.0038 | 0.0049 |
| Dispose (with Cleanup) | 254,204 | 0.0039 | 0.0050 |
| Dispose 10 Effects | 26,189 | 0.0382 | 0.0485 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 3,546,878 | 0.0003 | 0.0005 |
| Batch Update (10) | 1,782,384 | 0.0006 | 0.0009 |
| Batch Update (100) | 292,380 | 0.0034 | 0.0038 |
| Without Batch (10) | 759,738 | 0.0013 | 0.0019 |
| With Batch (10) | 183,344 | 0.0055 | 0.0066 |
| Nested Batch (2 levels) | 2,705,204 | 0.0004 | 0.0007 |
| Nested Batch (5 levels) | 1,465,676 | 0.0007 | 0.0012 |
| Batch with Computed | 244,081 | 0.0041 | 0.0059 |
| Batch with Diamond | 202,836 | 0.0049 | 0.0059 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 925 | 1.0807 | 1.7957 |
| 1 to N (Fan Out 1000) | 873 | 1.1450 | 1.6163 |
| N to 1 (Fan In 1000) | 14,316 | 0.0698 | 0.1291 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 5,880 | 0.1701 | 0.3347 |
| Create/Dispose 1K Computeds | 2,179 | 0.4588 | 1.0606 |
| Create/Dispose 1K Effects | 660 | 1.5134 | 2.8848 |
| Rapid GC (10K Cycles) | 840 | 1.1892 | 1.4365 |
| Subscription Churn (1K) | 24,731 | 0.0404 | 0.1803 |
| Object Pooling (10K) | 21 | 47.2218 | 49.6166 |
| Weak Reference Cleanup (1K) | 2,218 | 0.4507 | 1.0006 |
| Effect Cleanup (1K) | 157 | 6.3526 | 7.4206 |
| Circular Reference Cleanup | 30,874 | 0.0324 | 0.0472 |
| Large State Tree (10K) | 904 | 1.1054 | 1.9939 |
| Memory Usage Monitoring | 200 | 4.9991 | 5.6312 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,482 | 0.2231 | 0.5467 |
| [Atom] Initialize | 4,544 | 0.2201 | 0.5293 |
| [Vanilla] Sort (Name) | 4,162 | 0.2402 | 0.2959 |
| [Atom] Sort (Name) | 1,881 | 0.5314 | 0.7489 |
| [Vanilla] Filter (Department) | 470,568 | 0.0021 | 0.0030 |
| [Atom] Filter (Department) | 24,681 | 0.0405 | 0.0488 |
| [Vanilla] Sort + Filter + Paginate | 4,115 | 0.2430 | 0.2839 |
| [Atom] Sort + Filter + Paginate | 1,840 | 0.5432 | 0.6343 |
| Select/Deselect Rows | 1,812 | 0.5518 | 1.0163 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 9,675 | 0.1034 | 0.1884 |
| Wide Fan-out (1→100) | 9,059 | 0.1104 | 0.1844 |
| Diamond Pattern | 41,309 | 0.0242 | 0.0335 |
| Pyramid (50 levels) | 16,677 | 0.0600 | 0.0714 |
| Mixed (100A, 200C) | 51,998 | 0.0192 | 0.0253 |
| Circular Avoidance | 229,675 | 0.0044 | 0.0054 |
| Conditional Deps | 454,515 | 0.0022 | 0.0031 |
| Array Dynamic Deps | 459,330 | 0.0022 | 0.0032 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 551,641 | 0.0018 | 0.0064 |
| Toggle Completion | 9,229 | 0.1084 | 0.1395 |
| Filter (Active/Completed) | 508,233 | 0.0020 | 0.0030 |
| Delete (50 from 100) | 39,500 | 0.0253 | 0.0508 |
| Complete Workflow | 148,329 | 0.0067 | 0.0137 |
| Stats with Auto-update | 396,155 | 0.0025 | 0.0044 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 78,150 | 0.0128 | 0.0198 |
| Updates per frame (100 atoms, batched) | 33,025 | 0.0303 | 0.0393 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 3,666 | 0.2728 | 0.6860 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 150,637 | 0.0066 | 0.0126 |
| Form reset (no batch) | 607,159 | 0.0016 | 0.0032 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 839,157 | 0.0012 | 0.0019 |
