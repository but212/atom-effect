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

## Latest Results (v0.2.1)

**Date**: 2026-01-08  
**Environment**: GitHub Actions (`ubuntu-latest`), Node.js 20.x, V8 Engine

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 5,202,118 | 0.0002 | 0.0004 |
| Create (Object) | 5,088,420 | 0.0002 | 0.0005 |
| Create 100 Atoms | 54,059 | 0.0185 | 0.0274 |
| Read (Value) | 4,303,821 | 0.0002 | 0.0005 |
| Read (Peek) | 5,023,402 | 0.0002 | 0.0005 |
| Write (Single) | 4,723,961 | 0.0002 | 0.0004 |
| Write (10 times) | 3,020,528 | 0.0003 | 0.0006 |
| Subscribe/Unsubscribe | 3,933,284 | 0.0003 | 0.0006 |
| Notify (1 Subscriber) | 2,241,552 | 0.0004 | 0.0009 |
| Notify (10 Subscribers) | 1,282,349 | 0.0008 | 0.0014 |
| Dispose | 5,208,250 | 0.0002 | 0.0004 |
| Dispose (with Subscribers) | 3,665,888 | 0.0003 | 0.0006 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,666,045 | 0.0006 | 0.0012 |
| Create (3 Deps) | 1,147,453 | 0.0009 | 0.0015 |
| Create Chain (100) | 9,263 | 0.1080 | 0.3243 |
| Read (Single Dep) | 731,489 | 0.0014 | 0.0025 |
| Read (Multiple) | 486,968 | 0.0021 | 0.0042 |
| Nested Computation | 415,994 | 0.0024 | 0.0032 |
| Recompute (Single Dep) | 572,358 | 0.0017 | 0.0027 |
| Recompute (Chain of 10) | 88,536 | 0.0113 | 0.0190 |
| No Recompute (Unchanged) | 693,123 | 0.0014 | 0.0020 |
| Lazy (Not Accessed) | 1,653,855 | 0.0006 | 0.0013 |
| Lazy (Accessed Once) | 722,702 | 0.0014 | 0.0020 |
| Cache Invalidation | 566,196 | 0.0018 | 0.0024 |
| Diamond Invalidation | 245,036 | 0.0041 | 0.0055 |
| Dispose | 1,559,655 | 0.0006 | 0.0012 |
| Dispose Chain | 234,985 | 0.0043 | 0.0066 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 476,169 | 0.0021 | 0.0052 |
| Create (Multiple Deps) | 339,409 | 0.0029 | 0.0060 |
| Create 10 Effects | 48,541 | 0.0206 | 0.0378 |
| Execution (Dep Change) | 401,672 | 0.0025 | 0.0053 |
| Execution (Multiple) | 374,876 | 0.0027 | 0.0053 |
| With Computed Dep | 279,983 | 0.0036 | 0.0063 |
| Re-runs (10 times) | 359,257 | 0.0028 | 0.0055 |
| Multiple on Same Dep | 152,296 | 0.0066 | 0.0136 |
| With Cleanup | 398,649 | 0.0025 | 0.0054 |
| Cleanup on Dep Change | 406,412 | 0.0025 | 0.0052 |
| Dispose | 469,722 | 0.0021 | 0.0052 |
| Dispose (with Cleanup) | 464,435 | 0.0022 | 0.0052 |
| Dispose 10 Effects | 49,148 | 0.0203 | 0.0338 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 2,163,274 | 0.0005 | 0.0009 |
| Batch Update (10) | 363,161 | 0.0028 | 0.0039 |
| Batch Update (100) | 49,202 | 0.0203 | 0.0291 |
| Without Batch (10) | 115,804 | 0.0086 | 0.0180 |
| With Batch (10) | 86,749 | 0.0115 | 0.0202 |
| Nested Batch (2 levels) | 1,858,670 | 0.0005 | 0.0010 |
| Nested Batch (5 levels) | 468,360 | 0.0021 | 0.0031 |
| Batch with Computed | 310,525 | 0.0032 | 0.0044 |
| Batch with Diamond | 268,688 | 0.0037 | 0.0049 |
| Untracked Read (Single) | 3,182,493 | 0.0003 | 0.0007 |
| Untracked Read (Multiple) | 1,525,683 | 0.0007 | 0.0012 |
| Peek vs Value | 3,196,878 | 0.0003 | 0.0007 |
| Tracked (3 Deps) | 432,678 | 0.0023 | 0.0044 |
| Untracked (Ignores) | 556,692 | 0.0018 | 0.0025 |
| Partial Tracking | 377,447 | 0.0026 | 0.0036 |
| Nested Untracked | 1,171,806 | 0.0009 | 0.0014 |
| 100% Tracking | 170,520 | 0.0059 | 0.0089 |
| 50% Tracking | 168,991 | 0.0059 | 0.0082 |
| 0% Tracking | 255,916 | 0.0039 | 0.0051 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 5,380 | 0.1859 | 0.4706 |
| Create/Dispose 1K Computeds | 2,221 | 0.4502 | 1.0164 |
| Create/Dispose 1K Effects | 446 | 2.2399 | 3.7198 |
| Rapid GC (10K Cycles) | 848 | 1.1787 | 1.3765 |
| Subscription Churn (1K) | 35,595 | 0.0281 | 0.1275 |
| Object Pooling (10K) | 22 | 45.9778 | 51.6730 |
| Weak Reference Cleanup (1K) | 2,139 | 0.4674 | 1.0826 |
| Effect Cleanup (1K) | 141 | 7.0711 | 8.9314 |
| Circular Reference Cleanup | 36,084 | 0.0277 | 0.0450 |
| Large State Tree (10K) | 927 | 1.0785 | 1.9417 |
| Memory Usage Monitoring | 201 | 4.9704 | 5.6201 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,449 | 0.2248 | 0.5012 |
| Sort (Name) | 1,423 | 0.7026 | 8.1745 |
| Sort (Salary) | 1,600 | 0.6251 | 11.8787 |
| Filter (Department) | 1,887 | 0.5299 | 12.7871 |
| Paginate (10/page) | 2,016 | 0.4959 | 12.6932 |
| Sort + Filter + Paginate | 663 | 1.5079 | 8.0647 |
| Update Single Row | 4,397 | 0.2274 | 0.6475 |
| Batch Update (100 Rows) | 1,496 | 0.6684 | 1.1036 |
| Select/Deselect Rows | 1,869 | 0.5351 | 0.9003 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 4,254 | 0.2351 | 6.0812 |
| Wide Fan-out (1→100) | 8,552 | 0.1169 | 0.3461 |
| Diamond Pattern | 35,830 | 0.0279 | 0.0393 |
| Pyramid (50 levels) | 234 | 4.2780 | 18.7278 |
| Mixed (100A, 200C) | 3,381 | 0.2958 | 1.1927 |
| Circular Avoidance | 149,414 | 0.0067 | 0.0091 |
| Conditional Deps | 380,770 | 0.0026 | 0.0035 |
| Array Dynamic Deps | 173,446 | 0.0058 | 0.0072 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 34,767 | 0.0288 | 0.1024 |
| Toggle Completion | 14,378 | 0.0696 | 0.0942 |
| Filter (Active/Completed) | 25,897 | 0.0386 | 0.0644 |
| Delete (50 from 100) | 28,321 | 0.0353 | 0.0662 |
| Complete Workflow | 25,330 | 0.0395 | 0.0579 |
| Stats with Auto-update | 29,124 | 0.0343 | 0.0636 |
