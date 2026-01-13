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

## Latest Results (v0.4.0)

**Date**: 2026-01-13  
**Environment**: Github Actions, Node.js 20.x, V8 Engine  
**Architecture**: Push-State, Pull-Value reactive propagation

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Primitive) | 5,116,021 | 0.0002 | 0.0003 |
| Create (Object) | 5,063,710 | 0.0002 | 0.0003 |
| Create 100 Atoms | 56,302 | 0.0178 | 0.0272 |
| Read (Value) | 4,216,327 | 0.0002 | 0.0003 |
| Read (Peek) | 5,145,281 | 0.0002 | 0.0002 |
| Write (Single) | 4,444,557 | 0.0002 | 0.0003 |
| Write (10 times) | 2,737,268 | 0.0004 | 0.0004 |
| Subscribe/Unsubscribe | 4,055,180 | 0.0002 | 0.0004 |
| Notify (1 Subscriber) | 2,224,726 | 0.0004 | 0.0007 |
| Notify (10 Subscribers) | 1,624,760 | 0.0006 | 0.0009 |
| Dispose | 5,103,012 | 0.0002 | 0.0002 |
| Dispose (with Subscribers) | 3,689,676 | 0.0003 | 0.0004 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 1,757,267 | 0.0006 | 0.0009 |
| Create (3 Deps) | 1,163,860 | 0.0009 | 0.0012 |
| Create Chain (100) | 8,461 | 0.1182 | 0.2451 |
| Read (Single Dep) | 572,683 | 0.0017 | 0.0031 |
| Read (Multiple) | 426,957 | 0.0023 | 0.0028 |
| Nested Computation | 322,466 | 0.0031 | 0.0054 |
| Recompute (Single Dep) | 470,484 | 0.0021 | 0.0035 |
| Recompute (Chain of 10) | 80,073 | 0.0125 | 0.0229 |
| No Recompute (Unchanged) | 558,025 | 0.0018 | 0.0022 |
| Lazy (Not Accessed) | 1,768,699 | 0.0006 | 0.0008 |
| Lazy (Accessed Once) | 591,938 | 0.0017 | 0.0022 |
| Cache Invalidation | 480,956 | 0.0021 | 0.0027 |
| Diamond Invalidation | 211,351 | 0.0047 | 0.0062 |
| Dispose | 1,576,387 | 0.0006 | 0.0008 |
| Dispose Chain | 241,494 | 0.0041 | 0.0073 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 463,419 | 0.0022 | 0.0043 |
| Create (Multiple Deps) | 368,579 | 0.0027 | 0.0049 |
| Create 10 Effects | 58,608 | 0.0171 | 0.0334 |
| Execution (Dep Change) | 427,407 | 0.0023 | 0.0044 |
| Execution (Multiple) | 379,919 | 0.0026 | 0.0047 |
| With Computed Dep | 254,545 | 0.0039 | 0.0062 |
| Re-runs (10 times) | 383,184 | 0.0026 | 0.0047 |
| Multiple on Same Dep | 176,869 | 0.0057 | 0.0112 |
| With Cleanup | 425,149 | 0.0024 | 0.0042 |
| Cleanup on Dep Change | 420,349 | 0.0024 | 0.0044 |
| Dispose | 494,697 | 0.0020 | 0.0037 |
| Dispose (with Cleanup) | 488,448 | 0.0020 | 0.0035 |
| Dispose 10 Effects | 58,315 | 0.0171 | 0.0309 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 1,917,595 | 0.0005 | 0.0008 |
| Batch Update (10) | 386,071 | 0.0026 | 0.0030 |
| Batch Update (100) | 51,472 | 0.0194 | 0.0300 |
| Without Batch (10) | 81,452 | 0.0123 | 0.0242 |
| With Batch (10) | 55,283 | 0.0181 | 0.0322 |
| Nested Batch (2 levels) | 1,679,340 | 0.0006 | 0.0009 |
| Nested Batch (5 levels) | 476,629 | 0.0021 | 0.0026 |
| Batch with Computed | 247,757 | 0.0040 | 0.0064 |
| Batch with Diamond | 207,791 | 0.0048 | 0.0060 |
| Untracked Read (Single) | 3,156,813 | 0.0003 | 0.0004 |
| Untracked Read (Multiple) | 1,549,991 | 0.0006 | 0.0008 |
| Peek vs Value | 3,155,279 | 0.0003 | 0.0004 |
| Tracked (3 Deps) | 352,963 | 0.0028 | 0.0064 |
| Untracked (Ignores) | 465,133 | 0.0021 | 0.0025 |
| Partial Tracking | 325,507 | 0.0031 | 0.0038 |
| Nested Untracked | 1,116,378 | 0.0009 | 0.0015 |
| 100% Tracking | 192,382 | 0.0052 | 0.0089 |
| 50% Tracking | 176,645 | 0.0057 | 0.0091 |
| 0% Tracking | 241,947 | 0.0041 | 0.0048 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 871 | 1.1485 | 1.9327 |
| 1 to N (Fan Out 1000) | 789 | 1.2680 | 1.6275 |
| N to 1 (Fan In 1000) | 9,995 | 0.1000 | 0.2185 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 6,003 | 0.1666 | 0.3538 |
| Create/Dispose 1K Computeds | 2,202 | 0.4541 | 0.9052 |
| Create/Dispose 1K Effects | 547 | 1.8282 | 3.5052 |
| Rapid GC (10K Cycles) | 866 | 1.1554 | 1.2810 |
| Subscription Churn (1K) | 44,119 | 0.0227 | 0.1087 |
| Object Pooling (10K) | 19 | 52.4943 | 54.0572 |
| Weak Reference Cleanup (1K) | 2,168 | 0.4612 | 0.9093 |
| Effect Cleanup (1K) | 135 | 7.3988 | 8.7867 |
| Circular Reference Cleanup | 35,475 | 0.0282 | 0.0394 |
| Large State Tree (10K) | 963 | 1.0384 | 1.7616 |
| Memory Usage Monitoring | 175 | 5.7121 | 6.4825 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initialize | 3,874 | 0.2581 | 0.4464 |
| Sort (Name) | 1,350 | 0.7406 | 8.0865 |
| Sort (Salary) | 1,574 | 0.6353 | 8.3721 |
| Filter (Department) | 1,851 | 0.5401 | 11.5832 |
| Paginate (10/page) | 2,096 | 0.4772 | 10.5661 |
| Sort + Filter + Paginate | 620 | 1.6121 | 8.7593 |
| Update Single Row | 4,328 | 0.2310 | 0.5422 |
| Batch Update (100 Rows) | 1,502 | 0.6660 | 1.0022 |
| Select/Deselect Rows | 1,876 | 0.5330 | 0.8197 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,156 | 0.1226 | 0.3197 |
| Wide Fan-out (1→100) | 6,882 | 0.1453 | 0.2612 |
| Diamond Pattern | 32,813 | 0.0305 | 0.0419 |
| Pyramid (50 levels) | 561 | 1.7834 | 2.1631 |
| Mixed (100A, 200C) | 3,039 | 0.3290 | 0.7665 |
| Circular Avoidance | 144,419 | 0.0069 | 0.0115 |
| Conditional Deps | 341,457 | 0.0029 | 0.0035 |
| Array Dynamic Deps | 171,686 | 0.0058 | 0.0079 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 39,037 | 0.0256 | 0.0923 |
| Toggle Completion | 14,668 | 0.0682 | 0.0950 |
| Filter (Active/Completed) | 47,185 | 0.0212 | 0.0459 |
| Delete (50 from 100) | 29,891 | 0.0335 | 0.0475 |
| Complete Workflow | 35,917 | 0.0278 | 0.0447 |
| Stats with Auto-update | 33,938 | 0.0295 | 0.0559 |

---

### 3. Realistic-Benchmarks

#### Shopping Cart (E-commerce)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| E-commerce cart workflow | 55,165 | 0.0181 | 0.0331 |

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame | 11,769 | 0.0850 | 0.2615 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 3,450 | 0.2899 | 4.0474 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 37,248 | 0.0268 | 0.0625 |
| Form reset (no batch) | 56,870 | 0.0176 | 0.0333 |

> **Note**: The "no batch" case appears faster because it measures only the **scheduling cost** (updates are coalesced via microtask queue). The "batch" case includes **synchronous flush overhead**. Both result in the same Effect execution count (1 run). Use `batch()` when you need **guaranteed synchronous** completion.

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 15,001 | 0.0667 | 0.1479 |
