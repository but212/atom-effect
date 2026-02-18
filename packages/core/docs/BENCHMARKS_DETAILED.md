# Benchmark Results - Detailed

**Last Updated**: 2026-02-18
**Version**: v0.21.2
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 6,342 | 0.1577 | 0.8137 |
| Create 1000 Atoms (Objects) | 6,730 | 0.1486 | 0.8047 |
| Read 1000 Atoms (Value) | 36,278 | 0.0276 | 0.0405 |
| Read 1000 Atoms (Peek) | 598,636 | 0.0017 | 0.0022 |
| Write 1000 Atoms | 343,113 | 0.0029 | 0.0055 |
| Subscribe/Unsubscribe (x100) | 287,519 | 0.0035 | 0.0075 |
| Notify 1 Subscriber (x1000) | 28,242 | 0.0354 | 0.0478 |
| Untracked Read (x1000) | 36,267 | 0.0276 | 0.0378 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,369 | 0.4221 | 1.5883 |
| Create (3 Deps) (x1000) | 1,286 | 0.7776 | 1.8729 |
| Create Chain (100) | 7,224 | 0.1384 | 5.0387 |
| Read (Single Dep) (x1000) | 41,951 | 0.0238 | 0.0341 |
| Read (Multiple) (x1000) | 41,663 | 0.0240 | 0.0449 |
| Nested Computation (x1000) | 41,502 | 0.0241 | 0.0456 |
| Recompute (Single Dep) | 1,011,135 | 0.0010 | 0.0017 |
| Recompute (Chain of 10) | 189,273 | 0.0053 | 0.0146 |
| No Recompute (Unchanged) (x1000) | 35,842 | 0.0279 | 0.0373 |
| Lazy (Not Accessed) (x1000) | 2,446 | 0.4088 | 1.3597 |
| Lazy (Accessed Once) | 484,425 | 0.0021 | 0.0041 |
| Lazy (Multiple Access) | 454,162 | 0.0022 | 0.0052 |
| Cache Invalidation | 983,828 | 0.0010 | 0.0020 |
| Diamond Invalidation | 449,105 | 0.0022 | 0.0040 |
| Dispose (x1000) | 2,082 | 0.4804 | 1.5820 |
| Dispose Chain | 326,735 | 0.0031 | 0.0059 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 669,288 | 0.0015 | 0.0038 |
| Create (Multiple Deps) | 416,457 | 0.0024 | 0.0060 |
| Create 10 Effects | 86,440 | 0.0116 | 0.0214 |
| Execution (Dep Change) (x1000) | 16,758 | 0.0597 | 0.0840 |
| Execution (Multiple) (x1000) | 8,451 | 0.1183 | 0.1456 |
| With Computed Dep (x1000) | 16,928 | 0.0591 | 0.0739 |
| Re-runs (10 times) | 1,100,000 | 0.0009 | 0.0013 |
| Multiple on Same Dep (x1000) | 16,945 | 0.0590 | 0.0768 |
| With Cleanup | 513,091 | 0.0019 | 0.0044 |
| Cleanup on Dep Change (x1000) | 16,997 | 0.0588 | 0.0704 |
| Dispose | 650,852 | 0.0015 | 0.0037 |
| Dispose (with Cleanup) | 657,625 | 0.0015 | 0.0038 |
| Dispose 10 Effects | 85,379 | 0.0117 | 0.0228 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,434 | 0.1840 | 0.2635 |
| Batch Update (10) (x1000) | 2,571 | 0.3890 | 0.4826 |
| Batch Update (100) | 354,176 | 0.0028 | 0.0053 |
| Without Batch (10) | 835,054 | 0.0012 | 0.0019 |
| With Batch (10) | 212,219 | 0.0047 | 0.0125 |
| Nested Batch (2 levels) (x1000) | 3,796 | 0.2634 | 0.3848 |
| Nested Batch (5 levels) (x1000) | 1,484 | 0.6737 | 0.8192 |
| Batch with Computed | 391,721 | 0.0026 | 0.0043 |
| Batch with Diamond | 394,605 | 0.0025 | 0.0041 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 2,018 | 0.4956 | 1.0173 |
| 1 to N (Fan Out 1000) | 1,743 | 0.5737 | 1.1350 |
| N to 1 (Fan In 1000) | 8,585 | 0.1165 | 0.4134 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,382 | 0.2956 | 1.0266 |
| Create/Dispose 1K Computeds | 3,016 | 0.3315 | 0.9989 |
| Create/Dispose 1K Effects | 300 | 3.3379 | 4.5308 |
| Rapid GC (10K Cycles) | 352 | 2.8419 | 7.2983 |
| Subscription Churn (1K) | 29,679 | 0.0337 | 0.1719 |
| Object Pooling (10K) | 17 | 58.8960 | 61.3635 |
| Weak Reference Cleanup (1K) | 2,992 | 0.3342 | 1.0068 |
| Effect Cleanup (1K) | 105 | 9.5588 | 10.6586 |
| Circular Reference Cleanup | 15,475 | 0.0646 | 0.2939 |
| Large State Tree (10K) | 741 | 1.3501 | 2.1822 |
| Memory Usage Monitoring | 159 | 6.2830 | 7.2460 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,236 | 0.2361 | 0.4667 |
| [Atom] Initialize | 3,466 | 0.2885 | 1.1693 |
| [Vanilla] Sort (Name) | 4,436 | 0.2254 | 0.2810 |
| [Atom] Sort (Name) | 2,030 | 0.4925 | 0.8017 |
| [Vanilla] Filter (Department) | 489,359 | 0.0020 | 0.0035 |
| [Atom] Filter (Department) | 25,031 | 0.0400 | 0.0520 |
| [Vanilla] Sort + Filter + Paginate | 4,292 | 0.2330 | 0.3595 |
| [Atom] Sort + Filter + Paginate | 1,990 | 0.5024 | 0.8040 |
| Select/Deselect Rows | 1,910 | 0.5237 | 0.8372 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 21,604 | 0.0463 | 0.1791 |
| Wide Fan-out (1→100) | 18,555 | 0.0539 | 0.0778 |
| Diamond Pattern | 79,153 | 0.0126 | 0.0233 |
| Pyramid (50 levels) | 31,156 | 0.0321 | 0.0637 |
| Mixed (100A, 200C) | 123,159 | 0.0081 | 0.0174 |
| Circular Avoidance | 399,668 | 0.0025 | 0.0047 |
| Conditional Deps | 683,473 | 0.0015 | 0.0021 |
| Array Dynamic Deps | 679,761 | 0.0015 | 0.0025 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 854,607 | 0.0012 | 0.0029 |
| Toggle Completion | 9,328 | 0.1072 | 0.2335 |
| Filter (Active/Completed) | 698,116 | 0.0014 | 0.0025 |
| Delete (50 from 100) | 41,871 | 0.0239 | 0.0654 |
| Complete Workflow | 178,567 | 0.0056 | 0.0180 |
| Stats with Auto-update | 544,626 | 0.0018 | 0.0054 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 75,748 | 0.0132 | 0.0258 |
| Updates per frame (100 atoms, batched) | 32,356 | 0.0309 | 0.0611 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 4,796 | 0.2085 | 4.6434 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 160,547 | 0.0062 | 0.0162 |
| Form reset (no batch) | 621,524 | 0.0016 | 0.0027 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 818,034 | 0.0012 | 0.0018 |
