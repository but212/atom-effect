# Benchmark Results - Detailed

**Last Updated**: 2026-02-21
**Version**: v0.22.1
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 5,962 | 0.1496 | 0.9104 |
| Create 1000 Atoms (Objects) | 6,577 | 0.1381 | 0.8557 |
| Read 1000 Atoms (Value) | 38,159 | 0.0260 | 0.0425 |
| Read 1000 Atoms (Peek) | 613,467 | 0.0016 | 0.0025 |
| Write 1000 Atoms | 343,081 | 0.0029 | 0.0045 |
| Subscribe/Unsubscribe (x100) | 242,435 | 0.0039 | 0.0135 |
| Notify 1 Subscriber (x1000) | 28,685 | 0.0345 | 0.0462 |
| Untracked Read (x1000) | 38,069 | 0.0261 | 0.0387 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,233 | 0.4034 | 1.8126 |
| Create (3 Deps) (x1000) | 1,171 | 0.7687 | 2.5808 |
| Create Chain (100) | 6,987 | 0.1431 | 4.7088 |
| Read (Single Dep) (x1000) | 41,189 | 0.0238 | 0.0477 |
| Read (Multiple) (x1000) | 41,342 | 0.0235 | 0.0468 |
| Nested Computation (x1000) | 41,828 | 0.0238 | 0.0415 |
| Recompute (Single Dep) | 979,592 | 0.0010 | 0.0017 |
| Recompute (Chain of 10) | 173,480 | 0.0056 | 0.0149 |
| No Recompute (Unchanged) (x1000) | 35,659 | 0.0278 | 0.0377 |
| Lazy (Not Accessed) (x1000) | 2,546 | 0.3633 | 1.1739 |
| Lazy (Accessed Once) | 474,225 | 0.0012 | 0.0042 |
| Lazy (Multiple Access) | 462,992 | 0.0013 | 0.0041 |
| Cache Invalidation | 960,041 | 0.0010 | 0.0020 |
| Diamond Invalidation | 428,784 | 0.0023 | 0.0037 |
| Dispose (x1000) | 2,009 | 0.4408 | 1.8532 |
| Dispose Chain | 328,205 | 0.0027 | 0.0062 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 622,131 | 0.0013 | 0.0036 |
| Create (Multiple Deps) | 347,044 | 0.0021 | 0.0058 |
| Create 10 Effects | 76,909 | 0.0120 | 0.0266 |
| Execution (Dep Change) (x1000) | 17,776 | 0.0561 | 0.0817 |
| Execution (Multiple) (x1000) | 8,983 | 0.1104 | 0.1325 |
| With Computed Dep (x1000) | 17,700 | 0.0567 | 0.0729 |
| Re-runs (10 times) | 1,137,245 | 0.0009 | 0.0014 |
| Multiple on Same Dep (x1000) | 17,889 | 0.0553 | 0.0668 |
| With Cleanup | 498,032 | 0.0017 | 0.0042 |
| Cleanup on Dep Change (x1000) | 17,852 | 0.0555 | 0.0754 |
| Dispose | 612,224 | 0.0014 | 0.0037 |
| Dispose (with Cleanup) | 606,854 | 0.0014 | 0.0037 |
| Dispose 10 Effects | 80,848 | 0.0112 | 0.0233 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,123 | 0.1951 | 0.3189 |
| Batch Update (10) (x1000) | 2,549 | 0.3942 | 0.5435 |
| Batch Update (100) | 366,411 | 0.0027 | 0.0043 |
| Without Batch (10) | 805,007 | 0.0012 | 0.0016 |
| With Batch (10) | 200,815 | 0.0049 | 0.0137 |
| Nested Batch (2 levels) (x1000) | 3,646 | 0.2761 | 0.4546 |
| Nested Batch (5 levels) (x1000) | 1,568 | 0.6373 | 0.8311 |
| Batch with Computed | 366,276 | 0.0027 | 0.0054 |
| Batch with Diamond | 356,170 | 0.0028 | 0.0049 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,800 | 0.5266 | 1.4355 |
| 1 to N (Fan Out 1000) | 1,567 | 0.6289 | 1.1864 |
| N to 1 (Fan In 1000) | 8,048 | 0.1224 | 0.4644 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,430 | 0.2801 | 1.1086 |
| Create/Dispose 1K Computeds | 2,946 | 0.3237 | 1.1003 |
| Create/Dispose 1K Effects | 396 | 2.4652 | 3.6845 |
| Rapid GC (10K Cycles) | 417 | 2.3066 | 6.4038 |
| Subscription Churn (1K) | 26,552 | 0.0353 | 0.1803 |
| Object Pooling (10K) | 17 | 58.8758 | 60.6264 |
| Weak Reference Cleanup (1K) | 2,895 | 0.3249 | 1.1117 |
| Effect Cleanup (1K) | 115 | 8.5416 | 9.7474 |
| Circular Reference Cleanup | 16,833 | 0.0536 | 0.2900 |
| Large State Tree (10K) | 720 | 1.2864 | 2.7049 |
| Memory Usage Monitoring | 159 | 6.1882 | 7.4994 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,341 | 0.2281 | 0.4553 |
| [Atom] Initialize | 3,570 | 0.2291 | 1.1025 |
| [Vanilla] Sort (Name) | 4,410 | 0.2289 | 0.2846 |
| [Atom] Sort (Name) | 1,997 | 0.5025 | 0.9960 |
| [Vanilla] Filter (Department) | 434,576 | 0.0023 | 0.0039 |
| [Atom] Filter (Department) | 24,914 | 0.0397 | 0.0529 |
| [Vanilla] Sort + Filter + Paginate | 4,295 | 0.2352 | 0.2999 |
| [Atom] Sort + Filter + Paginate | 1,980 | 0.5123 | 0.6011 |
| Select/Deselect Rows | 1,816 | 0.5341 | 0.9172 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 18,730 | 0.0515 | 0.2106 |
| Wide Fan-out (1→100) | 16,194 | 0.0604 | 0.1121 |
| Diamond Pattern | 70,481 | 0.0140 | 0.0249 |
| Pyramid (50 levels) | 27,724 | 0.0354 | 0.0632 |
| Mixed (100A, 200C) | 114,551 | 0.0086 | 0.0180 |
| Circular Avoidance | 360,970 | 0.0028 | 0.0051 |
| Conditional Deps | 626,216 | 0.0016 | 0.0023 |
| Array Dynamic Deps | 627,176 | 0.0016 | 0.0026 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 782,372 | 0.0014 | 0.0029 |
| Toggle Completion | 9,321 | 0.1050 | 0.2623 |
| Filter (Active/Completed) | 694,137 | 0.0015 | 0.0023 |
| Delete (50 from 100) | 41,760 | 0.0362 | 0.0616 |
| Complete Workflow | 175,140 | 0.0065 | 0.0174 |
| Stats with Auto-update | 509,550 | 0.0018 | 0.0054 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 80,199 | 0.0121 | 0.0253 |
| Updates per frame (100 atoms, batched) | 30,304 | 0.0320 | 0.0888 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 4,538 | 0.1455 | 4.5667 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 160,489 | 0.0062 | 0.0157 |
| Form reset (no batch) | 623,447 | 0.0022 | 0.0026 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 777,439 | 0.0009 | 0.0020 |
