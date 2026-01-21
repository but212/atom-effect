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

**Date**: 2026-01-22  
**Environment**: GitHub Actions, Node.js 20.x, V8 Engine  

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

### 1. Micro-Benchmarks

#### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 13,925 | 0.0718 | 0.1408 |
| Create 1000 Atoms (Objects) | 13,814 | 0.0724 | 0.1423 |
| Read 1000 Atoms (Value) | 38,120 | 0.0262 | 0.0335 |
| Read 1000 Atoms (Peek) | 656,284 | 0.0015 | 0.0016 |
| Write 1000 Atoms | 343,069 | 0.0029 | 0.0031 |
| Subscribe/Unsubscribe (x100) | 401,851 | 0.0025 | 0.0039 |
| Notify 1 Subscriber (x1000) | 20,218 | 0.0495 | 0.0615 |
| Untracked Read (x1000) | 37,699 | 0.0265 | 0.0339 |

#### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 2,167,303 | 0.0005 | 0.0007 |
| Create (3 Deps) | 1,512,460 | 0.0007 | 0.0012 |
| Create Chain (100) | 8,218 | 0.1217 | 0.3003 |
| Read (Single Dep) | 5,365,713 | 0.0002 | 0.0003 |
| Read (Multiple) | 5,688,018 | 0.0002 | 0.0002 |
| Nested Computation | 5,429,579 | 0.0002 | 0.0002 |
| Recompute (Single Dep) | 564,296 | 0.0018 | 0.0026 |
| Recompute (Chain of 10) | 77,462 | 0.0129 | 0.0220 |
| No Recompute (Unchanged) | 5,229,715 | 0.0002 | 0.0002 |
| Lazy (Not Accessed) | 2,055,837 | 0.0005 | 0.0006 |
| Lazy (Accessed Once) | 536,223 | 0.0019 | 0.0025 |
| Lazy (Multiple Access) | 465,952 | 0.0021 | 0.0033 |
| Cache Invalidation | 543,618 | 0.0018 | 0.0025 |
| Diamond Invalidation | 218,898 | 0.0046 | 0.0054 |
| Dispose | 1,884,218 | 0.0005 | 0.0006 |
| Dispose Chain | 255,035 | 0.0039 | 0.0056 |

#### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 275,744 | 0.0036 | 0.0063 |
| Create (Multiple Deps) | 238,348 | 0.0042 | 0.0062 |
| Create 10 Effects | 28,278 | 0.0354 | 0.0601 |
| Execution (Dep Change) | 2,781,510 | 0.0004 | 0.0006 |
| Execution (Multiple) | 1,880,631 | 0.0005 | 0.0008 |
| With Computed Dep | 2,710,507 | 0.0004 | 0.0006 |
| Re-runs (10 times) | 876,060 | 0.0011 | 0.0018 |
| Multiple on Same Dep | 2,659,686 | 0.0004 | 0.0006 |
| With Cleanup | 243,266 | 0.0041 | 0.0059 |
| Cleanup on Dep Change | 2,771,699 | 0.0004 | 0.0006 |
| Dispose | 266,688 | 0.0037 | 0.0045 |
| Dispose (with Cleanup) | 266,538 | 0.0038 | 0.0050 |
| Dispose 10 Effects | 27,960 | 0.0358 | 0.0530 |

#### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) | 3,971,482 | 0.0003 | 0.0003 |
| Batch Update (10) | 2,634,517 | 0.0004 | 0.0004 |
| Batch Update (100) | 565,775 | 0.0018 | 0.0018 |
| Without Batch (10) | 931,972 | 0.0011 | 0.0017 |
| With Batch (10) | 171,594 | 0.0058 | 0.0078 |
| Nested Batch (2 levels) | 2,804,169 | 0.0004 | 0.0004 |
| Nested Batch (5 levels) | 1,431,001 | 0.0007 | 0.0009 |
| Batch with Computed | 239,466 | 0.0042 | 0.0062 |
| Batch with Diamond | 197,406 | 0.0051 | 0.0064 |

#### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 725 | 1.3792 | 2.7044 |
| 1 to N (Fan Out 1000) | 658 | 1.5204 | 2.0022 |
| N to 1 (Fan In 1000) | 8,828 | 0.1133 | 0.2460 |

---

### 2. Macro-Benchmarks

#### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 8,293 | 0.1206 | 0.2002 |
| Create/Dispose 1K Computeds | 1,910 | 0.5236 | 0.9825 |
| Create/Dispose 1K Effects | 587 | 1.7031 | 2.3904 |
| Rapid GC (10K Cycles) | 1,329 | 0.7522 | 0.9034 |
| Subscription Churn (1K) | 47,109 | 0.0212 | 0.1066 |
| Object Pooling (10K) | 19 | 53.6644 | 56.0122 |
| Weak Reference Cleanup (1K) | 1,921 | 0.5207 | 0.9580 |
| Effect Cleanup (1K) | 139 | 7.1827 | 7.7298 |
| Circular Reference Cleanup | 52,720 | 0.0190 | 0.0282 |
| Large State Tree (10K) | 964 | 1.0376 | 1.7451 |
| Memory Usage Monitoring | 185 | 5.3963 | 6.1069 |

#### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,232 | 0.2363 | 0.4690 |
| [Atom] Initialize | 4,198 | 0.2382 | 0.4808 |
| [Vanilla] Sort (Name) | 4,403 | 0.2271 | 0.2722 |
| [Atom] Sort (Name) | 1,605 | 0.6230 | 0.9948 |
| [Vanilla] Filter (Department) | 485,442 | 0.0021 | 0.0026 |
| [Atom] Filter (Department) | 16,362 | 0.0611 | 0.0714 |
| [Vanilla] Sort + Filter + Paginate | 4,254 | 0.2351 | 0.2706 |
| [Atom] Sort + Filter + Paginate | 1,502 | 0.6657 | 0.9305 |
| Select/Deselect Rows | 1,796 | 0.5567 | 0.8919 |

#### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 8,159 | 0.1226 | 0.2414 |
| Wide Fan-out (1→100) | 7,313 | 0.1367 | 0.1711 |
| Diamond Pattern | 35,046 | 0.0285 | 0.0413 |
| Pyramid (50 levels) | 13,395 | 0.0747 | 0.0914 |
| Mixed (100A, 200C) | 38,899 | 0.0257 | 0.0341 |
| Circular Avoidance | 196,309 | 0.0051 | 0.0061 |
| Conditional Deps | 401,818 | 0.0025 | 0.0030 |
| Array Dynamic Deps | 403,990 | 0.0025 | 0.0030 |

#### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 756,698 | 0.0013 | 0.0023 |
| Toggle Completion | 9,370 | 0.1067 | 0.1432 |
| Filter (Active/Completed) | 452,991 | 0.0022 | 0.0030 |
| Delete (50 from 100) | 42,487 | 0.0235 | 0.0476 |
| Complete Workflow | 158,994 | 0.0063 | 0.0143 |
| Stats with Auto-update | 488,457 | 0.0020 | 0.0046 |

---

### 3. Realistic-Benchmarks

#### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 85,603 | 0.0117 | 0.0207 |
| Updates per frame (100 atoms, batched) | 36,264 | 0.0276 | 0.0399 |

#### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 2,623 | 0.3812 | 2.3521 |

#### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 149,455 | 0.0067 | 0.0133 |
| Form reset (no batch) | 720,836 | 0.0014 | 0.0023 |

#### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 797,501 | 0.0013 | 0.0019 |
