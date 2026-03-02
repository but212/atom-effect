# Benchmark Results - Detailed

**Last Updated**: 2026-03-02
**Version**: v0.23.0
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 7,745 | 0.1291 | 0.7455 |
| Create 1000 Atoms (Objects) | 7,682 | 0.1302 | 0.7486 |
| Read 1000 Atoms (Value) | 38,360 | 0.0261 | 0.0365 |
| Read 1000 Atoms (Peek) | 605,499 | 0.0017 | 0.0026 |
| Write 1000 Atoms | 343,696 | 0.0029 | 0.0051 |
| Subscribe/Unsubscribe (x100) | 313,637 | 0.0032 | 0.0066 |
| Notify 1 Subscriber (x1000) | 27,504 | 0.0364 | 0.0481 |
| Untracked Read (x1000) | 38,357 | 0.0261 | 0.0366 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,165 | 0.4619 | 1.4780 |
| Create (3 Deps) (x1000) | 1,291 | 0.7745 | 1.9530 |
| Create Chain (100) | 14,428 | 0.0693 | 0.7629 |
| Read (Single Dep) (x1000) | 40,755 | 0.0245 | 0.0519 |
| Read (Multiple) (x1000) | 41,418 | 0.0241 | 0.0482 |
| Nested Computation (x1000) | 41,455 | 0.0241 | 0.0452 |
| Recompute (Single Dep) | 1,698,451 | 0.0006 | 0.0010 |
| Recompute (Chain of 10) | 485,179 | 0.0021 | 0.0037 |
| No Recompute (Unchanged) (x1000) | 35,658 | 0.0280 | 0.0395 |
| Lazy (Not Accessed) (x1000) | 2,230 | 0.4484 | 1.5555 |
| Lazy (Accessed Once) | 822,057 | 0.0012 | 0.0017 |
| Lazy (Multiple Access) | 748,765 | 0.0013 | 0.0022 |
| Cache Invalidation | 1,681,540 | 0.0006 | 0.0010 |
| Diamond Invalidation | 979,002 | 0.0010 | 0.0014 |
| Dispose (x1000) | 1,932 | 0.5175 | 1.6371 |
| Dispose Chain | 267,815 | 0.0037 | 0.0069 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 652,793 | 0.0015 | 0.0026 |
| Create (Multiple Deps) | 420,933 | 0.0024 | 0.0037 |
| Create 10 Effects | 80,427 | 0.0124 | 0.0224 |
| Execution (Dep Change) (x1000) | 17,579 | 0.0569 | 0.0690 |
| Execution (Multiple) (x1000) | 8,466 | 0.1181 | 0.1441 |
| With Computed Dep (x1000) | 17,190 | 0.0582 | 0.0716 |
| Re-runs (10 times) | 1,127,449 | 0.0009 | 0.0014 |
| Multiple on Same Dep (x1000) | 17,528 | 0.0570 | 0.1022 |
| With Cleanup | 526,471 | 0.0019 | 0.0028 |
| Cleanup on Dep Change (x1000) | 17,667 | 0.0566 | 0.0707 |
| Dispose | 616,940 | 0.0016 | 0.0022 |
| Dispose (with Cleanup) | 608,290 | 0.0016 | 0.0023 |
| Dispose 10 Effects | 79,655 | 0.0126 | 0.0222 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,641 | 0.1773 | 0.3149 |
| Batch Update (10) (x1000) | 2,405 | 0.4157 | 0.5802 |
| Batch Update (100) | 330,693 | 0.0030 | 0.0061 |
| Without Batch (10) | 859,109 | 0.0012 | 0.0016 |
| With Batch (10) | 310,504 | 0.0032 | 0.0065 |
| Nested Batch (2 levels) (x1000) | 3,713 | 0.2693 | 0.5678 |
| Nested Batch (5 levels) (x1000) | 1,595 | 0.6267 | 0.7916 |
| Batch with Computed | 648,165 | 0.0015 | 0.0028 |
| Batch with Diamond | 752,297 | 0.0013 | 0.0019 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 5,297 | 0.1888 | 0.3674 |
| 1 to N (Fan Out 1000) | 5,328 | 0.1877 | 0.2289 |
| N to 1 (Fan In 1000) | 34,007 | 0.0294 | 0.0548 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,632 | 0.2753 | 0.9594 |
| Create/Dispose 1K Computeds | 2,420 | 0.4132 | 1.1406 |
| Create/Dispose 1K Effects | 364 | 2.7419 | 4.6730 |
| Rapid GC (10K Cycles) | 474 | 2.1084 | 2.7989 |
| Subscription Churn (1K) | 37,164 | 0.0269 | 0.1481 |
| Object Pooling (10K) | 17 | 58.6567 | 60.9389 |
| Weak Reference Cleanup (1K) | 2,439 | 0.4098 | 1.1004 |
| Effect Cleanup (1K) | 113 | 8.8182 | 10.0197 |
| Circular Reference Cleanup | 19,119 | 0.0523 | 0.0789 |
| Large State Tree (10K) | 768 | 1.3015 | 2.1252 |
| Memory Usage Monitoring | 160 | 6.2408 | 7.2815 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,599 | 0.2174 | 0.4632 |
| [Atom] Initialize | 4,650 | 0.2150 | 0.4714 |
| [Vanilla] Sort (Name) | 4,426 | 0.2259 | 0.2720 |
| [Atom] Sort (Name) | 2,421 | 0.4129 | 0.6041 |
| [Vanilla] Filter (Department) | 456,862 | 0.0022 | 0.0039 |
| [Atom] Filter (Department) | 34,461 | 0.0290 | 0.0416 |
| [Vanilla] Sort + Filter + Paginate | 4,329 | 0.2310 | 0.2980 |
| [Atom] Sort + Filter + Paginate | 2,386 | 0.4190 | 0.5816 |
| Select/Deselect Rows | 1,911 | 0.5232 | 0.9267 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 61,048 | 0.0164 | 0.0271 |
| Wide Fan-out (1→100) | 53,374 | 0.0187 | 0.0315 |
| Diamond Pattern | 223,744 | 0.0045 | 0.0092 |
| Pyramid (50 levels) | 86,852 | 0.0115 | 0.0206 |
| Mixed (100A, 200C) | 159,221 | 0.0063 | 0.0143 |
| Circular Avoidance | 876,660 | 0.0011 | 0.0019 |
| Conditional Deps | 712,238 | 0.0014 | 0.0023 |
| Array Dynamic Deps | 727,502 | 0.0014 | 0.0021 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 832,828 | 0.0012 | 0.0029 |
| Toggle Completion | 8,981 | 0.1113 | 0.2494 |
| Filter (Active/Completed) | 1,066,667 | 0.0009 | 0.0016 |
| Delete (50 from 100) | 40,806 | 0.0245 | 0.0609 |
| Complete Workflow | 97,893 | 0.0102 | 0.0310 |
| Stats with Auto-update | 536,091 | 0.0019 | 0.0053 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 80,431 | 0.0124 | 0.0261 |
| Updates per frame (100 atoms, batched) | 43,571 | 0.0230 | 0.0417 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 7,255 | 0.1378 | 1.6277 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 218,924 | 0.0046 | 0.0133 |
| Form reset (no batch) | 621,863 | 0.0016 | 0.0025 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 860,562 | 0.0012 | 0.0017 |
