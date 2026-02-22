# Benchmark Results - Detailed

**Last Updated**: 2026-02-23
**Version**: v0.22.2
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 6,359 | 0.1435 | 0.8420 |
| Create 1000 Atoms (Objects) | 6,663 | 0.1369 | 0.8607 |
| Read 1000 Atoms (Value) | 36,342 | 0.0272 | 0.0430 |
| Read 1000 Atoms (Peek) | 623,955 | 0.0016 | 0.0024 |
| Write 1000 Atoms | 343,961 | 0.0029 | 0.0040 |
| Subscribe/Unsubscribe (x100) | 241,021 | 0.0040 | 0.0136 |
| Notify 1 Subscriber (x1000) | 28,293 | 0.0354 | 0.0501 |
| Untracked Read (x1000) | 35,899 | 0.0277 | 0.0373 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,463 | 0.3805 | 1.0869 |
| Create (3 Deps) (x1000) | 1,218 | 0.7475 | 2.0981 |
| Create Chain (100) | 7,071 | 0.0716 | 4.5255 |
| Read (Single Dep) (x1000) | 42,051 | 0.0235 | 0.0317 |
| Read (Multiple) (x1000) | 41,591 | 0.0238 | 0.0447 |
| Nested Computation (x1000) | 42,063 | 0.0235 | 0.0326 |
| Recompute (Single Dep) | 966,331 | 0.0010 | 0.0019 |
| Recompute (Chain of 10) | 162,025 | 0.0059 | 0.0152 |
| No Recompute (Unchanged) (x1000) | 35,876 | 0.0276 | 0.0363 |
| Lazy (Not Accessed) (x1000) | 2,615 | 0.3596 | 1.0462 |
| Lazy (Accessed Once) | 484,126 | 0.0012 | 0.0039 |
| Lazy (Multiple Access) | 460,101 | 0.0013 | 0.0041 |
| Cache Invalidation | 935,180 | 0.0011 | 0.0020 |
| Diamond Invalidation | 420,624 | 0.0024 | 0.0041 |
| Dispose (x1000) | 1,970 | 0.4663 | 1.6218 |
| Dispose Chain | 316,225 | 0.0029 | 0.0066 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 613,650 | 0.0013 | 0.0038 |
| Create (Multiple Deps) | 378,329 | 0.0020 | 0.0057 |
| Create 10 Effects | 78,794 | 0.0117 | 0.0249 |
| Execution (Dep Change) (x1000) | 17,622 | 0.0561 | 0.0810 |
| Execution (Multiple) (x1000) | 7,951 | 0.1259 | 0.1531 |
| With Computed Dep (x1000) | 17,634 | 0.0567 | 0.0697 |
| Re-runs (10 times) | 1,146,480 | 0.0009 | 0.0012 |
| Multiple on Same Dep (x1000) | 17,906 | 0.0552 | 0.0687 |
| With Cleanup | 517,986 | 0.0017 | 0.0043 |
| Cleanup on Dep Change (x1000) | 17,668 | 0.0567 | 0.0750 |
| Dispose | 613,854 | 0.0014 | 0.0037 |
| Dispose (with Cleanup) | 616,068 | 0.0014 | 0.0037 |
| Dispose 10 Effects | 81,726 | 0.0113 | 0.0235 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,470 | 0.1821 | 0.2710 |
| Batch Update (10) (x1000) | 2,561 | 0.3924 | 0.4761 |
| Batch Update (100) | 364,365 | 0.0027 | 0.0054 |
| Without Batch (10) | 856,554 | 0.0012 | 0.0018 |
| With Batch (10) | 202,763 | 0.0048 | 0.0137 |
| Nested Batch (2 levels) (x1000) | 3,054 | 0.3325 | 0.4651 |
| Nested Batch (5 levels) (x1000) | 1,446 | 0.6940 | 0.8787 |
| Batch with Computed | 360,287 | 0.0028 | 0.0051 |
| Batch with Diamond | 354,900 | 0.0028 | 0.0053 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,786 | 0.5309 | 1.0570 |
| 1 to N (Fan Out 1000) | 1,587 | 0.6139 | 1.1521 |
| N to 1 (Fan In 1000) | 7,864 | 0.1254 | 0.4662 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,371 | 0.2870 | 1.0840 |
| Create/Dispose 1K Computeds | 2,949 | 0.3210 | 1.1472 |
| Create/Dispose 1K Effects | 390 | 2.5105 | 3.7035 |
| Rapid GC (10K Cycles) | 423 | 2.2719 | 7.2852 |
| Subscription Churn (1K) | 26,417 | 0.0356 | 0.1806 |
| Object Pooling (10K) | 17 | 59.8190 | 62.1069 |
| Weak Reference Cleanup (1K) | 2,944 | 0.3190 | 1.1478 |
| Effect Cleanup (1K) | 117 | 8.4723 | 9.5892 |
| Circular Reference Cleanup | 17,893 | 0.0494 | 0.2683 |
| Large State Tree (10K) | 756 | 1.2629 | 2.1442 |
| Memory Usage Monitoring | 156 | 6.3135 | 7.6291 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,545 | 0.2201 | 0.4381 |
| [Atom] Initialize | 3,788 | 0.2139 | 1.0214 |
| [Vanilla] Sort (Name) | 4,406 | 0.2290 | 0.2710 |
| [Atom] Sort (Name) | 2,001 | 0.5010 | 0.9405 |
| [Vanilla] Filter (Department) | 453,634 | 0.0022 | 0.0037 |
| [Atom] Filter (Department) | 24,641 | 0.0402 | 0.0517 |
| [Vanilla] Sort + Filter + Paginate | 4,251 | 0.2382 | 0.2878 |
| [Atom] Sort + Filter + Paginate | 1,959 | 0.5191 | 0.6246 |
| Select/Deselect Rows | 1,907 | 0.5098 | 0.8446 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 18,707 | 0.0520 | 0.1927 |
| Wide Fan-out (1→100) | 16,395 | 0.0597 | 0.1065 |
| Diamond Pattern | 70,225 | 0.0139 | 0.0321 |
| Pyramid (50 levels) | 27,693 | 0.0351 | 0.0654 |
| Mixed (100A, 200C) | 120,077 | 0.0082 | 0.0174 |
| Circular Avoidance | 371,315 | 0.0027 | 0.0048 |
| Conditional Deps | 657,814 | 0.0015 | 0.0020 |
| Array Dynamic Deps | 653,135 | 0.0015 | 0.0025 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 797,389 | 0.0014 | 0.0029 |
| Toggle Completion | 9,338 | 0.1053 | 0.2192 |
| Filter (Active/Completed) | 699,338 | 0.0015 | 0.0022 |
| Delete (50 from 100) | 42,335 | 0.0355 | 0.0632 |
| Complete Workflow | 182,605 | 0.0062 | 0.0169 |
| Stats with Auto-update | 527,996 | 0.0017 | 0.0052 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 84,895 | 0.0115 | 0.0225 |
| Updates per frame (100 atoms, batched) | 31,277 | 0.0309 | 0.0676 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 4,776 | 0.1414 | 4.1734 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 158,067 | 0.0062 | 0.0157 |
| Form reset (no batch) | 618,795 | 0.0022 | 0.0026 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 938,169 | 0.0009 | 0.0017 |
