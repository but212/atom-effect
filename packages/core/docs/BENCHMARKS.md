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

## Latest Results (v0.16.1)

**Date**: 2026-01-27  
**Environment**: GitHub Actions, Node.js 20.x, V8 Engine  

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 13,836 | 0.0723 | 0.1387 |
| Create 1000 Atoms (Objects) | 13,566 | 0.0737 | 0.1423 |
| Read 1000 Atoms (Value) | 38,398 | 0.0260 | 0.0336 |
| Read 1000 Atoms (Peek) | 627,786 | 0.0016 | 0.0018 |
| Write 1000 Atoms | 556,059 | 0.0018 | 0.0027 |
| Subscribe/Unsubscribe (x100) | 140,014 | 0.0071 | 0.0133 |
| Notify 1 Subscriber (x1000) | 20,857 | 0.0479 | 0.0619 |
| Untracked Read (x1000) | 37,777 | 0.0265 | 0.0340 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 3,770 | 0.2652 | 0.3522 |
| Create (3 Deps) (x1000) | 2,246 | 0.4452 | 0.5417 |
| Create Chain (100) | 12,999 | 0.0769 | 0.1635 |
| Read (Single Dep) (x1000) | 14,013 | 0.0714 | 0.0803 |
| Read (Multiple) (x1000) | 13,192 | 0.0758 | 0.1126 |
| Nested Computation (x1000) | 13,397 | 0.0746 | 0.0869 |
| Recompute (Single Dep) | 863,250 | 0.0012 | 0.0015 |
| Recompute (Chain of 10) | 146,573 | 0.0068 | 0.0097 |
| No Recompute (Unchanged) (x1000) | 12,972 | 0.0771 | 0.0878 |
| Lazy (Not Accessed) (x1000) | 3,932 | 0.2543 | 0.3604 |
| Lazy (Accessed Once) | 825,579 | 0.0012 | 0.0015 |
| Lazy (Multiple Access) | 740,070 | 0.0014 | 0.0016 |
| Cache Invalidation | 826,752 | 0.0012 | 0.0020 |
| Diamond Invalidation | 382,273 | 0.0026 | 0.0046 |
| Dispose (x1000) | 2,542 | 0.3934 | 0.4913 |
| Dispose Chain | 318,653 | 0.0031 | 0.0036 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 360,949 | 0.0028 | 0.0046 |
| Create (Multiple Deps) | 296,648 | 0.0034 | 0.0041 |
| Create 10 Effects | 38,048 | 0.0263 | 0.0515 |
| Execution (Dep Change) (x1000) | 14,289 | 0.0700 | 0.0890 |
| Execution (Multiple) (x1000) | 6,915 | 0.1446 | 0.1782 |
| With Computed Dep (x1000) | 14,172 | 0.0706 | 0.0876 |
| Re-runs (10 times) | 966,973 | 0.0010 | 0.0014 |
| Multiple on Same Dep (x1000) | 14,158 | 0.0706 | 0.0819 |
| With Cleanup | 309,727 | 0.0032 | 0.0042 |
| Cleanup on Dep Change (x1000) | 12,817 | 0.0780 | 0.0929 |
| Dispose | 352,329 | 0.0028 | 0.0035 |
| Dispose (with Cleanup) | 350,563 | 0.0029 | 0.0036 |
| Dispose 10 Effects | 37,655 | 0.0266 | 0.0416 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 4,726 | 0.2116 | 0.2804 |
| Batch Update (10) (x1000) | 1,794 | 0.5574 | 0.6259 |
| Batch Update (100) | 229,916 | 0.0043 | 0.0059 |
| Without Batch (10) | 754,258 | 0.0013 | 0.0017 |
| With Batch (10) | 209,620 | 0.0048 | 0.0059 |
| Nested Batch (2 levels) (x1000) | 3,452 | 0.2897 | 0.4039 |
| Nested Batch (5 levels) (x1000) | 1,598 | 0.6260 | 0.8193 |
| Batch with Computed | 330,990 | 0.0030 | 0.0055 |
| Batch with Diamond | 326,565 | 0.0031 | 0.0035 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,722 | 0.5807 | 0.9774 |
| 1 to N (Fan Out 1000) | 1,428 | 0.7001 | 1.1326 |
| N to 1 (Fan In 1000) | 14,192 | 0.0705 | 0.1405 |

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 5,199 | 0.1923 | 0.3812 |
| Create/Dispose 1K Computeds | 2,684 | 0.3725 | 0.7366 |
| Create/Dispose 1K Effects | 214 | 4.6781 | 5.1021 |
| Rapid GC (10K Cycles) | 740 | 1.3521 | 1.4549 |
| Subscription Churn (1K) | 14,306 | 0.0699 | 0.1575 |
| Object Pooling (10K) | 17 | 58.7587 | 58.7572 |
| Weak Reference Cleanup (1K) | 2,709 | 0.3691 | 0.6872 |
| Effect Cleanup (1K) | 92 | 10.8560 | 11.3272 |
| Circular Reference Cleanup | 26,399 | 0.0379 | 0.0492 |
| Large State Tree (10K) | 752 | 1.3291 | 2.1701 |
| Memory Usage Monitoring | 163 | 6.1243 | 6.7003 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,532 | 0.2206 | 0.4727 |
| [Atom] Initialize | 4,648 | 0.2152 | 0.4961 |
| [Vanilla] Sort (Name) | 4,416 | 0.2264 | 0.2545 |
| [Atom] Sort (Name) | 2,009 | 0.4977 | 0.6350 |
| [Vanilla] Filter (Department) | 480,906 | 0.0021 | 0.0028 |
| [Atom] Filter (Department) | 24,986 | 0.0400 | 0.0638 |
| [Vanilla] Sort + Filter + Paginate | 4,310 | 0.2320 | 0.2607 |
| [Atom] Sort + Filter + Paginate | 1,992 | 0.5020 | 0.5667 |
| Select/Deselect Rows | 1,875 | 0.5333 | 0.8344 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 17,473 | 0.0572 | 0.0728 |
| Wide Fan-out (1→100) | 14,754 | 0.0678 | 0.0825 |
| Diamond Pattern | 67,818 | 0.0147 | 0.0245 |
| Pyramid (50 levels) | 24,550 | 0.0407 | 0.0524 |
| Mixed (100A, 200C) | 55,606 | 0.0180 | 0.0261 |
| Circular Avoidance | 338,042 | 0.0030 | 0.0036 |
| Conditional Deps | 564,403 | 0.0018 | 0.0022 |
| Array Dynamic Deps | 567,644 | 0.0018 | 0.0023 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 757,735 | 0.0013 | 0.0023 |
| Toggle Completion | 9,249 | 0.1081 | 0.1328 |
| Filter (Active/Completed) | 623,234 | 0.0016 | 0.0023 |
| Delete (50 from 100) | 42,384 | 0.0236 | 0.0466 |
| Complete Workflow | 180,494 | 0.0055 | 0.0114 |
| Stats with Auto-update | 494,569 | 0.0020 | 0.0046 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 72,160 | 0.0139 | 0.0229 |
| Updates per frame (100 atoms, batched) | 32,389 | 0.0309 | 0.0428 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 4,637 | 0.2157 | 0.4669 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 156,879 | 0.0064 | 0.0100 |
| Form reset (no batch) | 520,751 | 0.0019 | 0.0029 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 958,235 | 0.0010 | 0.0018 |
