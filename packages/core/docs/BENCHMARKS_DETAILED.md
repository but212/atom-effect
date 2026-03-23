# Benchmark Results - Detailed

**Last Updated**: 2026-03-23
**Version**: v0.23.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 6,968 | 0.1435 | 0.6900 |
| Create 1000 Atoms (Objects) | 6,671 | 0.1499 | 0.7515 |
| Read 1000 Atoms (Value) | 39,324 | 0.0254 | 0.0350 |
| Read 1000 Atoms (Peek) | 610,759 | 0.0016 | 0.0026 |
| Write 1000 Atoms | 336,604 | 0.0030 | 0.0048 |
| Subscribe/Unsubscribe (x100) | 243,869 | 0.0041 | 0.0145 |
| Notify 1 Subscriber (x1000) | 29,732 | 0.0336 | 0.0446 |
| Untracked Read (x1000) | 39,064 | 0.0256 | 0.0431 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 1,940 | 0.5153 | 1.9879 |
| Create (3 Deps) (x1000) | 1,185 | 0.8433 | 2.5034 |
| Create Chain (100) | 18,033 | 0.0555 | 0.6748 |
| Read (Single Dep) (x1000) | 38,598 | 0.0259 | 0.0391 |
| Read (Multiple) (x1000) | 38,565 | 0.0259 | 0.0473 |
| Nested Computation (x1000) | 33,522 | 0.0298 | 0.0452 |
| Recompute (Single Dep) | 1,393,849 | 0.0007 | 0.0014 |
| Recompute (Chain of 10) | 327,122 | 0.0031 | 0.0062 |
| No Recompute (Unchanged) (x1000) | 38,761 | 0.0258 | 0.0348 |
| Lazy (Not Accessed) (x1000) | 2,095 | 0.4772 | 1.9564 |
| Lazy (Accessed Once) | 876,062 | 0.0011 | 0.0021 |
| Lazy (Multiple Access) | 850,094 | 0.0012 | 0.0022 |
| Cache Invalidation | 1,373,766 | 0.0007 | 0.0014 |
| Diamond Invalidation | 744,052 | 0.0013 | 0.0024 |
| Dispose (x1000) | 2,096 | 0.4770 | 1.9950 |
| Dispose Chain | 284,263 | 0.0035 | 0.0072 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 650,461 | 0.0015 | 0.0032 |
| Create (Multiple Deps) | 406,239 | 0.0025 | 0.0054 |
| Create 10 Effects | 78,944 | 0.0127 | 0.0261 |
| Execution (Dep Change) (x1000) | 16,504 | 0.0606 | 0.1184 |
| Execution (Multiple) (x1000) | 7,824 | 0.1278 | 0.1654 |
| With Computed Dep (x1000) | 18,056 | 0.0554 | 0.0709 |
| Re-runs (10 times) | 1,110,786 | 0.0009 | 0.0017 |
| Multiple on Same Dep (x1000) | 17,777 | 0.0562 | 0.0760 |
| With Cleanup | 497,952 | 0.0020 | 0.0037 |
| Cleanup on Dep Change (x1000) | 17,761 | 0.0563 | 0.0748 |
| Dispose | 622,102 | 0.0016 | 0.0034 |
| Dispose (with Cleanup) | 700,593 | 0.0014 | 0.0028 |
| Dispose 10 Effects | 76,047 | 0.0131 | 0.0286 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,539 | 0.1805 | 0.3675 |
| Batch Update (10) (x1000) | 2,590 | 0.3860 | 0.5882 |
| Batch Update (100) | 376,326 | 0.0027 | 0.0052 |
| Without Batch (10) | 841,760 | 0.0012 | 0.0022 |
| With Batch (10) | 274,944 | 0.0036 | 0.0073 |
| Nested Batch (2 levels) (x1000) | 3,159 | 0.3165 | 0.5993 |
| Nested Batch (5 levels) (x1000) | 1,543 | 0.6479 | 0.9277 |
| Batch with Computed | 497,778 | 0.0020 | 0.0040 |
| Batch with Diamond | 548,331 | 0.0018 | 0.0035 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 3,493 | 0.2863 | 0.5258 |
| 1 to N (Fan Out 1000) | 3,374 | 0.2963 | 0.5975 |
| N to 1 (Fan In 1000) | 23,339 | 0.0428 | 0.0800 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 4,103 | 0.2437 | 0.6585 |
| Create/Dispose 1K Computeds | 2,947 | 0.3393 | 0.8516 |
| Create/Dispose 1K Effects | 262 | 3.8127 | 4.6618 |
| Rapid GC (10K Cycles) | 605 | 1.6522 | 2.1075 |
| Subscription Churn (1K) | 27,003 | 0.0370 | 0.1560 |
| Object Pooling (10K) | 21 | 46.9080 | 48.4508 |
| Weak Reference Cleanup (1K) | 2,907 | 0.3439 | 0.8581 |
| Effect Cleanup (1K) | 117 | 8.5204 | 9.4739 |
| Circular Reference Cleanup | 22,784 | 0.0439 | 0.0538 |
| Large State Tree (10K) | 984 | 1.0155 | 1.8306 |
| Memory Usage Monitoring | 195 | 5.1173 | 5.8187 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,702 | 0.2126 | 0.5563 |
| [Atom] Initialize | 4,682 | 0.2136 | 0.6047 |
| [Vanilla] Sort (Name) | 4,497 | 0.2224 | 0.2947 |
| [Atom] Sort (Name) | 2,447 | 0.4085 | 0.8116 |
| [Vanilla] Filter (Department) | 466,704 | 0.0021 | 0.0037 |
| [Atom] Filter (Department) | 34,856 | 0.0287 | 0.0436 |
| [Vanilla] Sort + Filter + Paginate | 4,324 | 0.2312 | 0.3234 |
| [Atom] Sort + Filter + Paginate | 2,372 | 0.4214 | 0.6927 |
| Select/Deselect Rows | 2,358 | 0.4239 | 0.9920 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 33,066 | 0.0302 | 0.0493 |
| Wide Fan-out (1→100) | 33,484 | 0.0299 | 0.0482 |
| Diamond Pattern | 137,187 | 0.0073 | 0.0165 |
| Pyramid (50 levels) | 54,798 | 0.0182 | 0.0328 |
| Mixed (100A, 200C) | 129,001 | 0.0078 | 0.0162 |
| Circular Avoidance | 631,156 | 0.0016 | 0.0028 |
| Conditional Deps | 824,364 | 0.0012 | 0.0022 |
| Array Dynamic Deps | 824,017 | 0.0012 | 0.0021 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 687,425 | 0.0015 | 0.0040 |
| Toggle Completion | 17,551 | 0.0570 | 0.2719 |
| Filter (Active/Completed) | 982,687 | 0.0010 | 0.0020 |
| Delete (50 from 100) | 39,953 | 0.0250 | 0.0797 |
| Complete Workflow | 175,371 | 0.0057 | 0.0210 |
| Stats with Auto-update | 470,058 | 0.0021 | 0.0053 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 76,558 | 0.0131 | 0.0254 |
| Updates per frame (100 atoms, batched) | 41,913 | 0.0239 | 0.0482 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 8,367 | 0.1195 | 1.4867 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 198,506 | 0.0050 | 0.0150 |
| Form reset (no batch) | 611,073 | 0.0016 | 0.0032 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 814,838 | 0.0012 | 0.0022 |
