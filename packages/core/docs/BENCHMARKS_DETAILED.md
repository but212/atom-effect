# Benchmark Results - Detailed

**Last Updated**: 2026-03-26
**Version**: v0.25.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 6,661 | 0.1501 | 0.5831 |
| Create 1000 Atoms (Objects) | 7,015 | 0.1426 | 0.5537 |
| Read 1000 Atoms (Value) | 38,065 | 0.0263 | 0.0343 |
| Read 1000 Atoms (Peek) | 665,300 | 0.0015 | 0.0015 |
| Write 1000 Atoms | 331,599 | 0.0030 | 0.0045 |
| Subscribe/Unsubscribe (x100) | 254,969 | 0.0039 | 0.0136 |
| Notify 1 Subscriber (x1000) | 29,658 | 0.0337 | 0.0412 |
| Untracked Read (x1000) | 36,520 | 0.0274 | 0.0350 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 1,954 | 0.5117 | 1.3625 |
| Create (3 Deps) (x1000) | 1,232 | 0.8113 | 1.6557 |
| Create Chain (100) | 20,608 | 0.0485 | 0.0602 |
| Read (Single Dep) (x1000) | 38,509 | 0.0260 | 0.0333 |
| Read (Multiple) (x1000) | 38,196 | 0.0262 | 0.0456 |
| Nested Computation (x1000) | 34,322 | 0.0291 | 0.0399 |
| Recompute (Single Dep) | 1,602,458 | 0.0006 | 0.0009 |
| Recompute (Chain of 10) | 330,227 | 0.0030 | 0.0032 |
| No Recompute (Unchanged) (x1000) | 38,622 | 0.0259 | 0.0331 |
| Lazy (Not Accessed) (x1000) | 2,061 | 0.4851 | 1.3433 |
| Lazy (Accessed Once) | 922,222 | 0.0011 | 0.0014 |
| Lazy (Multiple Access) | 900,648 | 0.0011 | 0.0017 |
| Cache Invalidation | 1,642,162 | 0.0006 | 0.0008 |
| Diamond Invalidation | 852,561 | 0.0012 | 0.0014 |
| Dispose (x1000) | 2,075 | 0.4818 | 1.4262 |
| Dispose Chain | 323,919 | 0.0031 | 0.0034 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 752,732 | 0.0013 | 0.0017 |
| Create (Multiple Deps) | 456,439 | 0.0022 | 0.0026 |
| Create 10 Effects | 89,890 | 0.0111 | 0.0212 |
| Execution (Dep Change) (x1000) | 17,801 | 0.0562 | 0.0671 |
| Execution (Multiple) (x1000) | 8,489 | 0.1178 | 0.1353 |
| With Computed Dep (x1000) | 18,548 | 0.0539 | 0.0627 |
| Re-runs (10 times) | 1,080,423 | 0.0009 | 0.0011 |
| Multiple on Same Dep (x1000) | 16,470 | 0.0607 | 0.0694 |
| With Cleanup | 589,704 | 0.0017 | 0.0020 |
| Cleanup on Dep Change (x1000) | 16,608 | 0.0602 | 0.0682 |
| Dispose | 746,682 | 0.0013 | 0.0016 |
| Dispose (with Cleanup) | 711,293 | 0.0014 | 0.0016 |
| Dispose 10 Effects | 90,261 | 0.0111 | 0.0199 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,798 | 0.1725 | 0.2564 |
| Batch Update (10) (x1000) | 2,656 | 0.3764 | 0.4726 |
| Batch Update (100) | 371,922 | 0.0027 | 0.0028 |
| Without Batch (10) | 836,050 | 0.0012 | 0.0014 |
| With Batch (10) | 294,946 | 0.0034 | 0.0040 |
| Nested Batch (2 levels) (x1000) | 3,767 | 0.2654 | 0.3884 |
| Nested Batch (5 levels) (x1000) | 1,690 | 0.5914 | 0.7247 |
| Batch with Computed | 572,680 | 0.0017 | 0.0026 |
| Batch with Diamond | 648,102 | 0.0015 | 0.0019 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 3,151 | 0.3173 | 0.3839 |
| 1 to N (Fan Out 1000) | 4,653 | 0.2149 | 0.4141 |
| N to 1 (Fan In 1000) | 22,993 | 0.0435 | 0.0703 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 4,214 | 0.2373 | 0.7165 |
| Create/Dispose 1K Computeds | 3,019 | 0.3312 | 0.9089 |
| Create/Dispose 1K Effects | 281 | 3.5556 | 4.3408 |
| Rapid GC (10K Cycles) | 585 | 1.7077 | 2.1819 |
| Subscription Churn (1K) | 26,970 | 0.0371 | 0.1583 |
| Object Pooling (10K) | 21 | 46.9408 | 47.7338 |
| Weak Reference Cleanup (1K) | 3,033 | 0.3296 | 0.9091 |
| Effect Cleanup (1K) | 117 | 8.5274 | 9.4577 |
| Circular Reference Cleanup | 22,301 | 0.0448 | 0.0686 |
| Large State Tree (10K) | 984 | 1.0158 | 1.7847 |
| Memory Usage Monitoring | 196 | 5.0978 | 5.9108 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,830 | 0.2070 | 0.4642 |
| [Atom] Initialize | 4,906 | 0.2038 | 0.4138 |
| [Vanilla] Sort (Name) | 4,523 | 0.2211 | 0.2539 |
| [Atom] Sort (Name) | 2,436 | 0.4104 | 0.5140 |
| [Vanilla] Filter (Department) | 490,050 | 0.0020 | 0.0025 |
| [Atom] Filter (Department) | 37,048 | 0.0270 | 0.0360 |
| [Vanilla] Sort + Filter + Paginate | 4,225 | 0.2367 | 0.2666 |
| [Atom] Sort + Filter + Paginate | 2,336 | 0.4281 | 0.4972 |
| Select/Deselect Rows | 2,443 | 0.4093 | 0.7521 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 36,216 | 0.0276 | 0.0374 |
| Wide Fan-out (1→100) | 38,692 | 0.0258 | 0.0347 |
| Diamond Pattern | 164,336 | 0.0061 | 0.0068 |
| Pyramid (50 levels) | 59,639 | 0.0168 | 0.0258 |
| Mixed (100A, 200C) | 128,306 | 0.0078 | 0.0100 |
| Circular Avoidance | 698,039 | 0.0014 | 0.0017 |
| Conditional Deps | 787,572 | 0.0013 | 0.0017 |
| Array Dynamic Deps | 821,801 | 0.0012 | 0.0015 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 820,723 | 0.0012 | 0.0021 |
| Toggle Completion | 17,977 | 0.0556 | 0.0727 |
| Filter (Active/Completed) | 1,048,903 | 0.0010 | 0.0014 |
| Delete (50 from 100) | 40,135 | 0.0249 | 0.0497 |
| Complete Workflow | 201,331 | 0.0050 | 0.0105 |
| Stats with Auto-update | 559,160 | 0.0018 | 0.0030 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 77,087 | 0.0130 | 0.0222 |
| Updates per frame (100 atoms, batched) | 41,362 | 0.0242 | 0.0399 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 9,156 | 0.1092 | 0.2254 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 212,340 | 0.0047 | 0.0098 |
| Form reset (no batch) | 611,904 | 0.0016 | 0.0023 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 992,465 | 0.0010 | 0.0014 |
