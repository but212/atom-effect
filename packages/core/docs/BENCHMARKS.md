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
| Create 1000 Atoms (Primitives) | 12,630 | 0.0792 | 0.1748 |
| Create 1000 Atoms (Objects) | 13,406 | 0.0746 | 0.1406 |
| Read 1000 Atoms (Value) | 35,451 | 0.0282 | 0.0357 |
| Read 1000 Atoms (Peek) | 626,246 | 0.0016 | 0.0018 |
| Write 1000 Atoms | 342,207 | 0.0029 | 0.0032 |
| Subscribe/Unsubscribe (x100) | 240,654 | 0.0042 | 0.0062 |
| Notify 1 Subscriber (x1000) | 13,801 | 0.0725 | 0.1577 |
| Untracked Read (x1000) | 35,294 | 0.0283 | 0.0365 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,895,319 | 0.0005 | 0.0021 |
| Create (3 Deps) | 1,217,187 | 0.0008 | 0.0025 |
| Create Chain (100) | 4,448 | 0.2248 | 4.1873 |
| Read (Single Dep) | 5,244,438 | 0.0002 | 0.0002 |
| Read (Multiple) | 5,422,656 | 0.0002 | 0.0002 |
| Nested Computation | 5,405,980 | 0.0002 | 0.0002 |
| Recompute (Single Dep) | 556,514 | 0.0018 | 0.0026 |
| Recompute (Chain of 10) | 82,247 | 0.0122 | 0.0213 |
| No Recompute (Unchanged) | 5,282,009 | 0.0002 | 0.0002 |
| Lazy (Not Accessed) | 1,947,834 | 0.0005 | 0.0021 |
| Lazy (Accessed Once) | 348,007 | 0.0029 | 0.0048 |
| Lazy (Multiple Access) | 336,090 | 0.0030 | 0.0045 |
| Cache Invalidation | 559,925 | 0.0018 | 0.0022 |
| Diamond Invalidation | 228,642 | 0.0044 | 0.0052 |
| Dispose | 1,702,039 | 0.0006 | 0.0022 |
| Dispose Chain | 310,820 | 0.0032 | 0.0038 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 286,312 | 0.0035 | 0.0064 |
| Create (Multiple Deps) | 242,142 | 0.0041 | 0.0056 |
| Create 10 Effects | 30,206 | 0.0331 | 0.0480 |
| Execution (Dep Change) | 2,652,318 | 0.0004 | 0.0007 |
| Execution (Multiple) | 1,712,363 | 0.0006 | 0.0009 |
| With Computed Dep | 2,385,875 | 0.0004 | 0.0007 |
| Re-runs (10 times) | 759,749 | 0.0013 | 0.0017 |
| Multiple on Same Dep | 2,599,506 | 0.0004 | 0.0007 |
| With Cleanup | 254,630 | 0.0039 | 0.0064 |
| Cleanup on Dep Change | 2,641,832 | 0.0004 | 0.0006 |
| Dispose | 284,794 | 0.0035 | 0.0042 |
| Dispose (with Cleanup) | 277,541 | 0.0036 | 0.0048 |
| Dispose 10 Effects | 28,685 | 0.0349 | 0.0571 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 3,203,826 | 0.0003 | 0.0004 |
| Batch Update (10) | 1,658,782 | 0.0006 | 0.0007 |
| Batch Update (100) | 262,256 | 0.0038 | 0.0044 |
| Without Batch (10) | 776,463 | 0.0013 | 0.0020 |
| With Batch (10) | 161,787 | 0.0062 | 0.0071 |
| Nested Batch (2 levels) | 2,511,453 | 0.0004 | 0.0005 |
| Nested Batch (5 levels) | 1,317,786 | 0.0008 | 0.0009 |
| Batch with Computed | 234,895 | 0.0043 | 0.0055 |
| Batch with Diamond | 197,945 | 0.0051 | 0.0061 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 795 | 1.2572 | 3.2270 |
| 1 to N (Fan Out 1000) | 751 | 1.3308 | 1.8987 |
| N to 1 (Fan In 1000) | 12,159 | 0.0822 | 0.1667 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 6,739 | 0.1484 | 0.2323 |
| Create/Dispose 1K Computeds | 2,471 | 0.4046 | 0.7900 |
| Create/Dispose 1K Effects | 616 | 1.6212 | 2.1079 |
| Rapid GC (10K Cycles) | 1,128 | 0.8863 | 1.5989 |
| Subscription Churn (1K) | 28,440 | 0.0352 | 0.1254 |
| Object Pooling (10K) | 18 | 53.2516 | 58.8726 |
| Weak Reference Cleanup (1K) | 2,507 | 0.3989 | 0.8092 |
| Effect Cleanup (1K) | 138 | 7.2225 | 8.2148 |
| Circular Reference Cleanup | 36,483 | 0.0274 | 0.0379 |
| Large State Tree (10K) | 936 | 1.0680 | 1.8111 |
| Memory Usage Monitoring | 179 | 5.5726 | 5.9710 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,405 | 0.2270 | 0.4291 |
| [Atom] Initialize | 4,395 | 0.2275 | 0.4370 |
| [Vanilla] Sort (Name) | 4,453 | 0.2245 | 0.2848 |
| [Atom] Sort (Name) | 1,654 | 0.6044 | 0.8016 |
| [Vanilla] Filter (Department) | 489,328 | 0.0020 | 0.0030 |
| [Atom] Filter (Department) | 17,091 | 0.0585 | 0.0944 |
| [Vanilla] Sort + Filter + Paginate | 4,187 | 0.2388 | 0.4735 |
| [Atom] Sort + Filter + Paginate | 1,609 | 0.6211 | 0.6817 |
| Select/Deselect Rows | 1,812 | 0.5517 | 0.8540 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,809 | 0.1135 | 0.2156 |
| Wide Fan-out (1→100) | 7,533 | 0.1327 | 0.2891 |
| Diamond Pattern | 36,585 | 0.0273 | 0.0374 |
| Pyramid (50 levels) | 13,945 | 0.0717 | 0.0853 |
| Mixed (100A, 200C) | 39,598 | 0.0253 | 0.0340 |
| Circular Avoidance | 206,916 | 0.0048 | 0.0058 |
| Conditional Deps | 413,917 | 0.0024 | 0.0029 |
| Array Dynamic Deps | 415,626 | 0.0024 | 0.0028 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 707,589 | 0.0014 | 0.0025 |
| Toggle Completion | 9,161 | 0.1091 | 0.1464 |
| Filter (Active/Completed) | 455,969 | 0.0022 | 0.0033 |
| Delete (50 from 100) | 41,212 | 0.0243 | 0.0521 |
| Complete Workflow | 170,144 | 0.0059 | 0.0123 |
| Stats with Auto-update | 499,150 | 0.0020 | 0.0034 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 78,900 | 0.0127 | 0.0221 |
| Updates per frame (100 atoms, batched) | 32,235 | 0.0310 | 0.0421 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 2,886 | 0.3464 | 2.0433 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 130,504 | 0.0077 | 0.0164 |
| Form reset (no batch) | 548,705 | 0.0018 | 0.0028 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 889,569 | 0.0011 | 0.0017 |
