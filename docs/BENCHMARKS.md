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

## Latest Results (v0.3.3)

**Date**: 2026-01-10  
**Environment**: GitHub Actions (ubuntu-latest), Node.js 20.x, V8 Engine  
**Architecture**: Push-State, Pull-Value reactive propagation

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 5,178,155 | 0.0002 | 0.0003 |
| Create (Object) | 5,109,825 | 0.0002 | 0.0003 |
| Create 100 Atoms | 53,799 | 0.0186 | 0.0278 |
| Read (Value) | 4,281,714 | 0.0002 | 0.0003 |
| Read (Peek) | 4,838,931 | 0.0002 | 0.0003 |
| Write (Single) | 4,498,854 | 0.0002 | 0.0003 |
| Write (10 times) | 2,907,834 | 0.0003 | 0.0004 |
| Subscribe/Unsubscribe | 4,176,882 | 0.0002 | 0.0003 |
| Notify (1 Subscriber) | 2,218,592 | 0.0005 | 0.0007 |
| Notify (10 Subscribers) | 1,631,336 | 0.0006 | 0.0009 |
| Dispose | 4,994,970 | 0.0002 | 0.0003 |
| Dispose (with Subscribers) | 3,834,875 | 0.0003 | 0.0004 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,845,628 | 0.0005 | 0.0008 |
| Create (3 Deps) | 1,260,055 | 0.0008 | 0.0010 |
| Create Chain (100) | 7,958 | 0.1257 | 0.2681 |
| Read (Single Dep) | 612,805 | 0.0016 | 0.0020 |
| Read (Multiple) | 460,471 | 0.0022 | 0.0035 |
| Nested Computation | 346,241 | 0.0029 | 0.0048 |
| Recompute (Single Dep) | 492,215 | 0.0020 | 0.0025 |
| Recompute (Chain of 10) | 80,110 | 0.0125 | 0.0233 |
| No Recompute (Unchanged) | 572,007 | 0.0017 | 0.0028 |
| Lazy (Not Accessed) | 1,808,369 | 0.0006 | 0.0009 |
| Lazy (Accessed Once) | 620,821 | 0.0016 | 0.0020 |
| Cache Invalidation | 491,155 | 0.0020 | 0.0031 |
| Diamond Invalidation | 225,307 | 0.0044 | 0.0075 |
| Dispose | 1,690,713 | 0.0006 | 0.0007 |
| Dispose Chain | 253,112 | 0.0040 | 0.0073 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 555,790 | 0.0018 | 0.0037 |
| Create (Multiple Deps) | 429,348 | 0.0023 | 0.0045 |
| Create 10 Effects | 70,683 | 0.0141 | 0.0270 |
| Execution (Dep Change) | 508,086 | 0.0020 | 0.0038 |
| Execution (Multiple) | 448,508 | 0.0022 | 0.0042 |
| With Computed Dep | 287,414 | 0.0035 | 0.0059 |
| Re-runs (10 times) | 443,581 | 0.0023 | 0.0036 |
| Multiple on Same Dep | 219,938 | 0.0045 | 0.0081 |
| With Cleanup | 494,499 | 0.0020 | 0.0038 |
| Cleanup on Dep Change | 481,440 | 0.0021 | 0.0039 |
| Dispose | 582,110 | 0.0017 | 0.0029 |
| Dispose (with Cleanup) | 586,817 | 0.0017 | 0.0031 |
| Dispose 10 Effects | 70,291 | 0.0142 | 0.0255 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 2,027,859 | 0.0005 | 0.0007 |
| Batch Update (10) | 396,132 | 0.0025 | 0.0031 |
| Batch Update (100) | 51,123 | 0.0196 | 0.0287 |
| Without Batch (10) | 88,664 | 0.0113 | 0.0223 |
| With Batch (10) | 62,631 | 0.0160 | 0.0286 |
| Nested Batch (2 levels) | 1,700,875 | 0.0006 | 0.0008 |
| Nested Batch (5 levels) | 501,810 | 0.0020 | 0.0023 |
| Batch with Computed | 269,757 | 0.0037 | 0.0049 |
| Batch with Diamond | 230,840 | 0.0043 | 0.0052 |
| Untracked Read (Single) | 3,066,750 | 0.0003 | 0.0005 |
| Untracked Read (Multiple) | 1,474,584 | 0.0007 | 0.0009 |
| Peek vs Value | 3,067,107 | 0.0003 | 0.0004 |
| Tracked (3 Deps) | 394,708 | 0.0025 | 0.0054 |
| Untracked (Ignores) | 498,949 | 0.0020 | 0.0024 |
| Partial Tracking | 350,404 | 0.0029 | 0.0048 |
| Nested Untracked | 1,195,544 | 0.0008 | 0.0010 |
| 100% Tracking | 206,305 | 0.0048 | 0.0081 |
| 50% Tracking | 187,800 | 0.0053 | 0.0089 |
| 0% Tracking | 248,996 | 0.0040 | 0.0047 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,005 | 0.9951 | 2.2986 |
| 1 to N (Fan Out 1000) | 976 | 1.0246 | 1.3556 |
| N to 1 (Fan In 1000) | 15,000 | 0.0667 | 0.1447 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 5,449 | 0.1835 | 0.3583 |
| Create/Dispose 1K Computeds | 2,248 | 0.4449 | 0.8670 |
| Create/Dispose 1K Effects | 648 | 1.5434 | 3.2285 |
| Rapid GC (10K Cycles) | 812 | 1.2309 | 1.3625 |
| Subscription Churn (1K) | 44,442 | 0.0225 | 0.1087 |
| Object Pooling (10K) | 20 | 51.0081 | 55.8855 |
| Weak Reference Cleanup (1K) | 2,199 | 0.4547 | 0.8745 |
| Effect Cleanup (1K) | 140 | 7.1487 | 8.3619 |
| Circular Reference Cleanup | 34,636 | 0.0289 | 0.0393 |
| Large State Tree (10K) | 539 | 1.8544 | 11.0270 |
| Memory Usage Monitoring | 179 | 5.5768 | 6.4417 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,231 | 0.2364 | 0.4693 |
| Sort (Name) | 1,391 | 0.7187 | 7.6999 |
| Sort (Salary) | 1,649 | 0.6063 | 7.6913 |
| Filter (Department) | 1,947 | 0.5136 | 11.4323 |
| Paginate (10/page) | 2,133 | 0.4689 | 11.0082 |
| Sort + Filter + Paginate | 754 | 1.3270 | 7.8627 |
| Update Single Row | 4,113 | 0.2432 | 0.5372 |
| Batch Update (100 Rows) | 1,485 | 0.6736 | 1.0046 |
| Select/Deselect Rows | 1,847 | 0.5415 | 0.8233 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 9,070 | 0.1103 | 0.2385 |
| Wide Fan-out (1→100) | 7,607 | 0.1315 | 0.2021 |
| Diamond Pattern | 35,763 | 0.0280 | 0.0391 |
| Pyramid (50 levels) | 598 | 1.6722 | 2.5871 |
| Mixed (100A, 200C) | 3,385 | 0.2954 | 0.6577 |
| Circular Avoidance | 158,876 | 0.0063 | 0.0089 |
| Conditional Deps | 377,626 | 0.0026 | 0.0032 |
| Array Dynamic Deps | 176,766 | 0.0057 | 0.0070 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 39,467 | 0.0253 | 0.0920 |
| Toggle Completion | 14,634 | 0.0683 | 0.0983 |
| Filter (Active/Completed) | 28,265 | 0.0354 | 0.0629 |
| Delete (50 from 100) | 28,878 | 0.0346 | 0.0515 |
| Complete Workflow | 28,900 | 0.0346 | 0.0573 |
| Stats with Auto-update | 31,116 | 0.0321 | 0.0613 |

---

### 3. Realistic-Benchmarks

#### Shopping Cart (E-commerce)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| E-commerce cart workflow | 56,917 | 0.0176 | 0.0303 |

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame | 25,776 | 0.0388 | 0.0850 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 4,363 | 0.2292 | 3.2404 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 41,910 | 0.0239 | 0.0479 |
| Form reset (no batch) | 62,190 | 0.0161 | 0.0311 |

> **Note**: The "no batch" case appears faster because it measures only the **scheduling cost** (updates are coalesced via microtask queue). The "batch" case includes **synchronous flush overhead**. Both result in the same Effect execution count (1 run). Use `batch()` when you need **guaranteed synchronous** completion.

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 21,157 | 0.0473 | 0.1105 |
