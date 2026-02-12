# Benchmark Results - Detailed

**Last Updated**: 2026-02-12
**Version**: v0.21.0
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 7,487 | 0.1336 | 0.6930 |
| Create 1000 Atoms (Objects) | 8,250 | 0.1212 | 0.6929 |
| Read 1000 Atoms (Value) | 38,089 | 0.0263 | 0.0343 |
| Read 1000 Atoms (Peek) | 625,002 | 0.0016 | 0.0017 |
| Write 1000 Atoms | 342,581 | 0.0029 | 0.0030 |
| Subscribe/Unsubscribe (x100) | 281,458 | 0.0036 | 0.0053 |
| Notify 1 Subscriber (x1000) | 23,728 | 0.0421 | 0.0522 |
| Untracked Read (x1000) | 37,745 | 0.0265 | 0.0345 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,852 | 0.3507 | 1.4136 |
| Create (3 Deps) (x1000) | 1,592 | 0.6282 | 1.8101 |
| Create Chain (100) | 15,150 | 0.0660 | 0.0989 |
| Read (Single Dep) (x1000) | 41,878 | 0.0239 | 0.0313 |
| Read (Multiple) (x1000) | 41,800 | 0.0239 | 0.0381 |
| Nested Computation (x1000) | 42,037 | 0.0238 | 0.0309 |
| Recompute (Single Dep) | 1,000,053 | 0.0010 | 0.0014 |
| Recompute (Chain of 10) | 181,689 | 0.0055 | 0.0104 |
| No Recompute (Unchanged) (x1000) | 33,473 | 0.0299 | 0.0406 |
| Lazy (Not Accessed) (x1000) | 3,054 | 0.3274 | 1.1883 |
| Lazy (Accessed Once) | 824,370 | 0.0012 | 0.0020 |
| Lazy (Multiple Access) | 846,845 | 0.0012 | 0.0015 |
| Cache Invalidation | 946,914 | 0.0011 | 0.0017 |
| Diamond Invalidation | 441,761 | 0.0023 | 0.0031 |
| Dispose (x1000) | 2,355 | 0.4246 | 1.5155 |
| Dispose Chain | 352,668 | 0.0028 | 0.0037 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 725,782 | 0.0014 | 0.0018 |
| Create (Multiple Deps) | 473,513 | 0.0021 | 0.0028 |
| Create 10 Effects | 94,186 | 0.0106 | 0.0197 |
| Execution (Dep Change) (x1000) | 17,067 | 0.0586 | 0.0719 |
| Execution (Multiple) (x1000) | 8,114 | 0.1232 | 0.2589 |
| With Computed Dep (x1000) | 17,166 | 0.0583 | 0.0757 |
| Re-runs (10 times) | 1,094,133 | 0.0009 | 0.0013 |
| Multiple on Same Dep (x1000) | 17,082 | 0.0585 | 0.0750 |
| With Cleanup | 571,791 | 0.0017 | 0.0023 |
| Cleanup on Dep Change (x1000) | 17,079 | 0.0586 | 0.0777 |
| Dispose | 728,210 | 0.0014 | 0.0018 |
| Dispose (with Cleanup) | 747,302 | 0.0013 | 0.0016 |
| Dispose 10 Effects | 90,261 | 0.0111 | 0.0196 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,521 | 0.1811 | 0.2538 |
| Batch Update (10) (x1000) | 2,210 | 0.4526 | 0.5481 |
| Batch Update (100) | 284,107 | 0.0035 | 0.0050 |
| Without Batch (10) | 825,356 | 0.0012 | 0.0016 |
| With Batch (10) | 209,532 | 0.0048 | 0.0082 |
| Nested Batch (2 levels) (x1000) | 3,417 | 0.2927 | 0.3835 |
| Nested Batch (5 levels) (x1000) | 1,865 | 0.5363 | 0.6378 |
| Batch with Computed | 400,233 | 0.0025 | 0.0029 |
| Batch with Diamond | 400,749 | 0.0025 | 0.0029 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,983 | 0.5042 | 0.9192 |
| 1 to N (Fan Out 1000) | 1,755 | 0.5697 | 1.0729 |
| N to 1 (Fan In 1000) | 8,721 | 0.1147 | 0.3079 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,984 | 0.2510 | 0.8240 |
| Create/Dispose 1K Computeds | 3,197 | 0.3128 | 0.9221 |
| Create/Dispose 1K Effects | 333 | 3.0015 | 3.7763 |
| Rapid GC (10K Cycles) | 514 | 1.9469 | 2.5094 |
| Subscription Churn (1K) | 31,849 | 0.0314 | 0.1351 |
| Object Pooling (10K) | 17 | 58.6479 | 62.6018 |
| Weak Reference Cleanup (1K) | 3,256 | 0.3071 | 0.9217 |
| Effect Cleanup (1K) | 106 | 9.4026 | 10.1912 |
| Circular Reference Cleanup | 19,988 | 0.0500 | 0.0875 |
| Large State Tree (10K) | 466 | 2.1443 | 11.5752 |
| Memory Usage Monitoring | 162 | 6.1694 | 6.9470 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,672 | 0.2141 | 0.4106 |
| [Atom] Initialize | 4,690 | 0.2132 | 0.4225 |
| [Vanilla] Sort (Name) | 4,409 | 0.2268 | 0.2534 |
| [Atom] Sort (Name) | 1,991 | 0.5023 | 0.5824 |
| [Vanilla] Filter (Department) | 505,119 | 0.0020 | 0.0026 |
| [Atom] Filter (Department) | 25,100 | 0.0398 | 0.0484 |
| [Vanilla] Sort + Filter + Paginate | 4,320 | 0.2315 | 0.2608 |
| [Atom] Sort + Filter + Paginate | 2,002 | 0.4996 | 0.5543 |
| Select/Deselect Rows | 1,875 | 0.5334 | 0.7843 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 21,424 | 0.0467 | 0.0716 |
| Wide Fan-out (1→100) | 17,956 | 0.0557 | 0.0698 |
| Diamond Pattern | 77,781 | 0.0129 | 0.0221 |
| Pyramid (50 levels) | 31,244 | 0.0320 | 0.0439 |
| Mixed (100A, 200C) | 117,749 | 0.0085 | 0.0162 |
| Circular Avoidance | 390,250 | 0.0026 | 0.0033 |
| Conditional Deps | 665,222 | 0.0015 | 0.0019 |
| Array Dynamic Deps | 659,155 | 0.0015 | 0.0020 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 885,099 | 0.0011 | 0.0021 |
| Toggle Completion | 9,331 | 0.1072 | 0.1696 |
| Filter (Active/Completed) | 711,384 | 0.0014 | 0.0019 |
| Delete (50 from 100) | 42,679 | 0.0234 | 0.0460 |
| Complete Workflow | 192,881 | 0.0052 | 0.0107 |
| Stats with Auto-update | 617,360 | 0.0016 | 0.0026 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 79,489 | 0.0126 | 0.0219 |
| Updates per frame (100 atoms, batched) | 31,287 | 0.0320 | 0.0451 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 7,602 | 0.1315 | 0.4523 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 163,469 | 0.0061 | 0.0123 |
| Form reset (no batch) | 594,708 | 0.0017 | 0.0025 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 972,613 | 0.0010 | 0.0016 |
