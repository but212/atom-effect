# Benchmark Results - Detailed

**Last Updated**: 2026-01-30  
**Version**: v0.17.0  
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 8,470 | 0.1181 | 0.7323 |
| Create 1000 Atoms (Objects) | 8,213 | 0.1218 | 0.7570 |
| Read 1000 Atoms (Value) | 37,941 | 0.0264 | 0.0341 |
| Read 1000 Atoms (Peek) | 661,465 | 0.0015 | 0.0029 |
| Write 1000 Atoms | 335,055 | 0.0030 | 0.0048 |
| Subscribe/Unsubscribe (x100) | 295,116 | 0.0034 | 0.0057 |
| Notify 1 Subscriber (x1000) | 37,841 | 0.0264 | 0.0396 |
| Untracked Read (x1000) | 37,739 | 0.0265 | 0.0354 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,465 | 0.4057 | 1.6242 |
| Create (3 Deps) (x1000) | 1,449 | 0.6903 | 2.0671 |
| Create Chain (100) | 11,304 | 0.0885 | 0.1249 |
| Read (Single Dep) (x1000) | 14,809 | 0.0675 | 0.0860 |
| Read (Multiple) (x1000) | 13,942 | 0.0717 | 0.1258 |
| Nested Computation (x1000) | 14,087 | 0.0710 | 0.0801 |
| Recompute (Single Dep) | 782,046 | 0.0013 | 0.0016 |
| Recompute (Chain of 10) | 146,368 | 0.0068 | 0.0113 |
| No Recompute (Unchanged) (x1000) | 13,784 | 0.0725 | 0.0852 |
| Lazy (Not Accessed) (x1000) | 2,630 | 0.3803 | 1.4878 |
| Lazy (Accessed Once) | 679,327 | 0.0015 | 0.0019 |
| Lazy (Multiple Access) | 600,078 | 0.0017 | 0.0025 |
| Cache Invalidation | 778,178 | 0.0013 | 0.0022 |
| Diamond Invalidation | 359,796 | 0.0028 | 0.0036 |
| Dispose (x1000) | 1,895 | 0.5278 | 1.8909 |
| Dispose Chain | 268,819 | 0.0037 | 0.0053 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 286,421 | 0.0035 | 0.0058 |
| Create (Multiple Deps) | 233,610 | 0.0043 | 0.0063 |
| Create 10 Effects | 33,243 | 0.0301 | 0.0579 |
| Execution (Dep Change) (x1000) | 20,600 | 0.0485 | 0.0613 |
| Execution (Multiple) (x1000) | 9,787 | 0.1022 | 0.1199 |
| With Computed Dep (x1000) | 20,647 | 0.0484 | 0.0757 |
| Re-runs (10 times) | 1,080,989 | 0.0009 | 0.0014 |
| Multiple on Same Dep (x1000) | 20,757 | 0.0482 | 0.0605 |
| With Cleanup | 260,249 | 0.0038 | 0.0048 |
| Cleanup on Dep Change (x1000) | 20,688 | 0.0483 | 0.0604 |
| Dispose | 292,970 | 0.0034 | 0.0050 |
| Dispose (with Cleanup) | 279,985 | 0.0036 | 0.0050 |
| Dispose 10 Effects | 32,769 | 0.0305 | 0.0477 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 3,806 | 0.2628 | 0.3889 |
| Batch Update (10) (x1000) | 2,312 | 0.4326 | 0.5515 |
| Batch Update (100) | 402,243 | 0.0025 | 0.0041 |
| Without Batch (10) | 584,336 | 0.0017 | 0.0021 |
| With Batch (10) | 179,312 | 0.0056 | 0.0079 |
| Nested Batch (2 levels) (x1000) | 2,601 | 0.3845 | 0.6542 |
| Nested Batch (5 levels) (x1000) | 1,276 | 0.7836 | 1.0450 |
| Batch with Computed | 293,268 | 0.0034 | 0.0055 |
| Batch with Diamond | 284,223 | 0.0035 | 0.0057 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,566 | 0.6387 | 1.1450 |
| 1 to N (Fan Out 1000) | 1,273 | 0.7853 | 1.2042 |
| N to 1 (Fan In 1000) | 13,026 | 0.0768 | 0.1447 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,938 | 0.2539 | 0.9576 |
| Create/Dispose 1K Computeds | 2,543 | 0.3932 | 1.1875 |
| Create/Dispose 1K Effects | 328 | 3.0481 | 3.9710 |
| Rapid GC (10K Cycles) | 496 | 2.0171 | 2.7077 |
| Subscription Churn (1K) | 32,722 | 0.0306 | 0.1522 |
| Object Pooling (10K) | 17 | 59.1681 | 59.1882 |
| Weak Reference Cleanup (1K) | 2,573 | 0.3887 | 1.2202 |
| Effect Cleanup (1K) | 109 | 9.1494 | 10.2092 |
| Circular Reference Cleanup | 21,401 | 0.0467 | 0.0866 |
| Large State Tree (10K) | 749 | 1.3348 | 2.2039 |
| Memory Usage Monitoring | 155 | 6.4565 | 7.4973 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,553 | 0.2196 | 0.4998 |
| [Atom] Initialize | 4,596 | 0.2176 | 0.5122 |
| [Vanilla] Sort (Name) | 4,399 | 0.2273 | 0.2527 |
| [Atom] Sort (Name) | 1,798 | 0.5560 | 0.6334 |
| [Vanilla] Filter (Department) | 429,323 | 0.0023 | 0.0038 |
| [Atom] Filter (Department) | 24,448 | 0.0409 | 0.0507 |
| [Vanilla] Sort + Filter + Paginate | 4,306 | 0.2323 | 0.2624 |
| [Atom] Sort + Filter + Paginate | 1,909 | 0.5239 | 0.6081 |
| Select/Deselect Rows | 1,874 | 0.5336 | 0.8204 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 16,164 | 0.0619 | 0.0845 |
| Wide Fan-out (1→100) | 13,191 | 0.0758 | 0.0939 |
| Diamond Pattern | 61,869 | 0.0162 | 0.0251 |
| Pyramid (50 levels) | 23,825 | 0.0420 | 0.0545 |
| Mixed (100A, 200C) | 52,254 | 0.0191 | 0.0273 |
| Circular Avoidance | 312,497 | 0.0032 | 0.0052 |
| Conditional Deps | 493,336 | 0.0020 | 0.0036 |
| Array Dynamic Deps | 500,097 | 0.0020 | 0.0032 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 719,556 | 0.0014 | 0.0025 |
| Toggle Completion | 9,350 | 0.1070 | 0.1533 |
| Filter (Active/Completed) | 579,548 | 0.0017 | 0.0028 |
| Delete (50 from 100) | 41,806 | 0.0239 | 0.0483 |
| Complete Workflow | 160,300 | 0.0062 | 0.0124 |
| Stats with Auto-update | 466,544 | 0.0021 | 0.0036 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 55,746 | 0.0179 | 0.0283 |
| Updates per frame (100 atoms, batched) | 29,796 | 0.0336 | 0.0490 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 3,877 | 0.2579 | 1.0684 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 138,575 | 0.0072 | 0.0154 |
| Form reset (no batch) | 478,560 | 0.0021 | 0.0033 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 827,625 | 0.0012 | 0.0019 |
