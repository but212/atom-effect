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

## Latest Results (v0.3.1)

**Date**: 2026-01-09  
**Environment**: GitHub Actions (`ubuntu-latest`), Node.js 20.x, V8 Engine

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 4,951,313 | 0.0002 | 0.0003 |
| Create (Object) | 5,002,031 | 0.0002 | 0.0003 |
| Create 100 Atoms | 61,051 | 0.0164 | 0.0261 |
| Read (Value) | 4,177,850 | 0.0002 | 0.0003 |
| Read (Peek) | 5,005,398 | 0.0002 | 0.0002 |
| Write (Single) | 4,368,481 | 0.0002 | 0.0003 |
| Write (10 times) | 2,765,410 | 0.0004 | 0.0004 |
| Subscribe/Unsubscribe | 3,914,313 | 0.0003 | 0.0004 |
| Notify (1 Subscriber) | 2,059,217 | 0.0005 | 0.0008 |
| Notify (10 Subscribers) | 1,488,070 | 0.0007 | 0.0010 |
| Dispose | 4,810,228 | 0.0002 | 0.0003 |
| Dispose (with Subscribers) | 3,706,937 | 0.0003 | 0.0005 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,838,997 | 0.0005 | 0.0009 |
| Create (3 Deps) | 1,215,427 | 0.0008 | 0.0013 |
| Create Chain (100) | 9,457 | 0.1057 | 0.2617 |
| Read (Single Dep) | 628,525 | 0.0016 | 0.0020 |
| Read (Multiple) | 480,760 | 0.0021 | 0.0025 |
| Nested Computation | 353,355 | 0.0028 | 0.0046 |
| Recompute (Single Dep) | 499,157 | 0.0020 | 0.0034 |
| Recompute (Chain of 10) | 82,557 | 0.0121 | 0.0215 |
| No Recompute (Unchanged) | 582,317 | 0.0017 | 0.0030 |
| Lazy (Not Accessed) | 1,866,691 | 0.0005 | 0.0007 |
| Lazy (Accessed Once) | 619,044 | 0.0016 | 0.0021 |
| Cache Invalidation | 505,008 | 0.0020 | 0.0024 |
| Diamond Invalidation | 225,264 | 0.0044 | 0.0052 |
| Dispose | 1,592,825 | 0.0006 | 0.0012 |
| Dispose Chain | 273,933 | 0.0037 | 0.0065 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 548,311 | 0.0018 | 0.0040 |
| Create (Multiple Deps) | 427,541 | 0.0023 | 0.0044 |
| Create 10 Effects | 69,694 | 0.0143 | 0.0274 |
| Execution (Dep Change) | 495,978 | 0.0020 | 0.0039 |
| Execution (Multiple) | 438,632 | 0.0023 | 0.0044 |
| With Computed Dep | 286,505 | 0.0035 | 0.0060 |
| Re-runs (10 times) | 414,804 | 0.0024 | 0.0041 |
| Multiple on Same Dep | 211,504 | 0.0047 | 0.0077 |
| With Cleanup | 474,235 | 0.0021 | 0.0039 |
| Cleanup on Dep Change | 459,345 | 0.0022 | 0.0042 |
| Dispose | 569,301 | 0.0018 | 0.0032 |
| Dispose (with Cleanup) | 562,372 | 0.0018 | 0.0032 |
| Dispose 10 Effects | 69,107 | 0.0145 | 0.0261 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 1,925,168 | 0.0005 | 0.0007 |
| Batch Update (10) | 380,064 | 0.0026 | 0.0032 |
| Batch Update (100) | 51,406 | 0.0195 | 0.0304 |
| Without Batch (10) | 86,279 | 0.0116 | 0.0232 |
| With Batch (10) | 61,443 | 0.0163 | 0.0305 |
| Nested Batch (2 levels) | 1,633,395 | 0.0006 | 0.0008 |
| Nested Batch (5 levels) | 483,023 | 0.0021 | 0.0024 |
| Batch with Computed | 273,509 | 0.0037 | 0.0043 |
| Batch with Diamond | 233,644 | 0.0043 | 0.0051 |
| Untracked Read (Single) | 3,071,948 | 0.0003 | 0.0005 |
| Untracked Read (Multiple) | 1,521,800 | 0.0007 | 0.0010 |
| Peek vs Value | 3,140,476 | 0.0003 | 0.0004 |
| Tracked (3 Deps) | 394,308 | 0.0025 | 0.0036 |
| Untracked (Ignores) | 493,788 | 0.0020 | 0.0024 |
| Partial Tracking | 344,700 | 0.0029 | 0.0035 |
| Nested Untracked | 1,163,452 | 0.0009 | 0.0010 |
| 100% Tracking | 206,512 | 0.0048 | 0.0081 |
| 50% Tracking | 183,118 | 0.0055 | 0.0106 |
| 0% Tracking | 245,094 | 0.0041 | 0.0047 |

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
