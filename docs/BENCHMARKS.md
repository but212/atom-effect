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

## Latest Results (v0.3.2)

**Date**: 2026-01-09  
**Environment**: GitHub Actions (ubuntu-latest), Node.js 20.x, V8 Engine  
**Architecture**: Push-State, Pull-Value reactive propagation

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 5,176,206 | 0.0002 | 0.0003 |
| Create (Object) | 5,242,114 | 0.0002 | 0.0003 |
| Create 100 Atoms | 54,932 | 0.0182 | 0.0289 |
| Read (Value) | 4,199,297 | 0.0002 | 0.0003 |
| Read (Peek) | 4,903,786 | 0.0002 | 0.0003 |
| Write (Single) | 4,673,159 | 0.0002 | 0.0003 |
| Write (10 times) | 2,893,965 | 0.0003 | 0.0005 |
| Subscribe/Unsubscribe | 3,795,967 | 0.0003 | 0.0004 |
| Notify (1 Subscriber) | 2,239,372 | 0.0004 | 0.0008 |
| Notify (10 Subscribers) | 1,570,226 | 0.0006 | 0.0010 |
| Dispose | 4,880,471 | 0.0002 | 0.0003 |
| Dispose (with Subscribers) | 3,854,652 | 0.0003 | 0.0004 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,735,279 | 0.0006 | 0.0010 |
| Create (3 Deps) | 1,164,949 | 0.0009 | 0.0012 |
| Create Chain (100) | 8,159 | 0.1226 | 0.2912 |
| Read (Single Dep) | 605,348 | 0.0017 | 0.0024 |
| Read (Multiple) | 456,858 | 0.0022 | 0.0036 |
| Nested Computation | 344,132 | 0.0029 | 0.0046 |
| Recompute (Single Dep) | 495,355 | 0.0020 | 0.0027 |
| Recompute (Chain of 10) | 84,592 | 0.0118 | 0.0213 |
| No Recompute (Unchanged) | 566,620 | 0.0018 | 0.0032 |
| Lazy (Not Accessed) | 1,752,518 | 0.0006 | 0.0009 |
| Lazy (Accessed Once) | 616,915 | 0.0016 | 0.0023 |
| Cache Invalidation | 494,405 | 0.0020 | 0.0026 |
| Diamond Invalidation | 223,714 | 0.0045 | 0.0061 |
| Dispose | 1,621,391 | 0.0006 | 0.0008 |
| Dispose Chain | 261,866 | 0.0038 | 0.0070 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 581,976 | 0.0017 | 0.0035 |
| Create (Multiple Deps) | 420,692 | 0.0024 | 0.0043 |
| Create 10 Effects | 69,643 | 0.0144 | 0.0329 |
| Execution (Dep Change) | 496,750 | 0.0020 | 0.0040 |
| Execution (Multiple) | 441,363 | 0.0023 | 0.0043 |
| With Computed Dep | 287,406 | 0.0035 | 0.0060 |
| Re-runs (10 times) | 427,996 | 0.0023 | 0.0043 |
| Multiple on Same Dep | 202,082 | 0.0049 | 0.0098 |
| With Cleanup | 486,960 | 0.0021 | 0.0039 |
| Cleanup on Dep Change | 481,427 | 0.0021 | 0.0040 |
| Dispose | 575,094 | 0.0017 | 0.0032 |
| Dispose (with Cleanup) | 552,056 | 0.0018 | 0.0034 |
| Dispose 10 Effects | 68,854 | 0.0145 | 0.0264 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 1,931,877 | 0.0005 | 0.0008 |
| Batch Update (10) | 389,783 | 0.0026 | 0.0030 |
| Batch Update (100) | 55,498 | 0.0180 | 0.0281 |
| Without Batch (10) | 86,503 | 0.0116 | 0.0227 |
| With Batch (10) | 62,451 | 0.0160 | 0.0294 |
| Nested Batch (2 levels) | 1,645,520 | 0.0006 | 0.0008 |
| Nested Batch (5 levels) | 498,627 | 0.0020 | 0.0024 |
| Batch with Computed | 257,251 | 0.0039 | 0.0049 |
| Batch with Diamond | 217,572 | 0.0046 | 0.0057 |
| Untracked Read (Single) | 3,213,011 | 0.0003 | 0.0004 |
| Untracked Read (Multiple) | 1,501,735 | 0.0007 | 0.0009 |
| Peek vs Value | 3,216,658 | 0.0003 | 0.0004 |
| Tracked (3 Deps) | 392,243 | 0.0025 | 0.0046 |
| Untracked (Ignores) | 495,419 | 0.0020 | 0.0024 |
| Partial Tracking | 342,389 | 0.0029 | 0.0048 |
| Nested Untracked | 1,173,809 | 0.0009 | 0.0011 |
| 100% Tracking | 206,819 | 0.0048 | 0.0089 |
| 50% Tracking | 185,514 | 0.0054 | 0.0089 |
| 0% Tracking | 245,565 | 0.0041 | 0.0048 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,029 | 0.9715 | 2.2853 |
| 1 to N (Fan Out 1000) | 953 | 1.0486 | 1.4291 |
| N to 1 (Fan In 1000) | 13,914 | 0.0719 | 0.1470 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 5,518 | 0.1812 | 0.4654 |
| Create/Dispose 1K Computeds | 2,299 | 0.4350 | 0.9738 |
| Create/Dispose 1K Effects | 645 | 1.5485 | 3.3537 |
| Rapid GC (10K Cycles) | 893 | 1.1194 | 1.3472 |
| Subscription Churn (1K) | 43,747 | 0.0229 | 0.1190 |
| Object Pooling (10K) | 19 | 51.4691 | 54.3711 |
| Weak Reference Cleanup (1K) | 2,271 | 0.4403 | 0.9552 |
| Effect Cleanup (1K) | 140 | 7.1043 | 8.5590 |
| Circular Reference Cleanup | 38,009 | 0.0263 | 0.0380 |
| Large State Tree (10K) | 540 | 1.8491 | 11.2331 |
| Memory Usage Monitoring | 186 | 5.3586 | 5.9507 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 4,013 | 0.2491 | 0.5404 |
| Sort (Name) | 1,332 | 0.7502 | 8.2358 |
| Sort (Salary) | 1,602 | 0.6240 | 7.9496 |
| Filter (Department) | 1,869 | 0.5348 | 11.9240 |
| Paginate (10/page) | 2,065 | 0.4841 | 11.0166 |
| Sort + Filter + Paginate | 737 | 1.3557 | 9.1868 |
| Update Single Row | 3,985 | 0.2509 | 0.6615 |
| Batch Update (100 Rows) | 1,434 | 0.6972 | 1.1802 |
| Select/Deselect Rows | 1,786 | 0.5598 | 0.9202 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,955 | 0.1117 | 0.3503 |
| Wide Fan-out (1→100) | 7,687 | 0.1301 | 0.2552 |
| Diamond Pattern | 36,129 | 0.0277 | 0.0390 |
| Pyramid (50 levels) | 590 | 1.6947 | 2.7098 |
| Mixed (100A, 200C) | 3,412 | 0.2931 | 0.7356 |
| Circular Avoidance | 158,127 | 0.0063 | 0.0088 |
| Conditional Deps | 375,886 | 0.0027 | 0.0036 |
| Array Dynamic Deps | 184,343 | 0.0054 | 0.0064 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 38,113 | 0.0262 | 0.0980 |
| Toggle Completion | 14,753 | 0.0678 | 0.0921 |
| Filter (Active/Completed) | 26,728 | 0.0374 | 0.0617 |
| Delete (50 from 100) | 29,823 | 0.0335 | 0.0486 |
| Complete Workflow | 27,266 | 0.0367 | 0.0602 |
| Stats with Auto-update | 30,159 | 0.0332 | 0.0704 |

---

### 3. Realistic-Benchmarks

#### Shopping Cart (E-commerce)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| E-commerce cart workflow | 56,687 | 0.0176 | 0.0293 |

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame | 23,212 | 0.0431 | 0.1253 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 4,679 | 0.2137 | 0.7247 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 41,038 | 0.0244 | 0.0543 |
| Form reset (no batch) | 61,157 | 0.0164 | 0.0303 |

> **Note**: The "no batch" case appears faster because it measures only the **scheduling cost** (updates are coalesced via microtask queue). The "batch" case includes **synchronous flush overhead**. Both result in the same Effect execution count (1 run). Use `batch()` when you need **guaranteed synchronous** completion.

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 20,162 | 0.0496 | 0.1147 |
