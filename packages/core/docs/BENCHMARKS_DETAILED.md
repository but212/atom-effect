# Benchmark Results - Detailed

**Last Updated**: 2026-03-25
**Version**: v0.24.1
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 6,849 | 0.1460 | 0.5355 |
| Create 1000 Atoms (Objects) | 7,104 | 0.1408 | 0.5356 |
| Read 1000 Atoms (Value) | 25,301 | 0.0395 | 0.0492 |
| Read 1000 Atoms (Peek) | 643,919 | 0.0016 | 0.0020 |
| Write 1000 Atoms | 333,562 | 0.0030 | 0.0055 |
| Subscribe/Unsubscribe (x100) | 262,796 | 0.0038 | 0.0136 |
| Notify 1 Subscriber (x1000) | 29,739 | 0.0336 | 0.0436 |
| Untracked Read (x1000) | 24,822 | 0.0403 | 0.0527 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 1,970 | 0.5075 | 1.0035 |
| Create (3 Deps) (x1000) | 1,225 | 0.8161 | 1.3593 |
| Create Chain (100) | 17,985 | 0.0556 | 0.0795 |
| Read (Single Dep) (x1000) | 38,442 | 0.0260 | 0.0340 |
| Read (Multiple) (x1000) | 38,251 | 0.0261 | 0.0442 |
| Nested Computation (x1000) | 34,584 | 0.0289 | 0.0369 |
| Recompute (Single Dep) | 1,692,690 | 0.0006 | 0.0007 |
| Recompute (Chain of 10) | 307,324 | 0.0033 | 0.0033 |
| No Recompute (Unchanged) (x1000) | 33,173 | 0.0301 | 0.0388 |
| Lazy (Not Accessed) (x1000) | 2,287 | 0.4372 | 0.9530 |
| Lazy (Accessed Once) | 974,093 | 0.0010 | 0.0012 |
| Lazy (Multiple Access) | 910,317 | 0.0011 | 0.0017 |
| Cache Invalidation | 1,660,178 | 0.0006 | 0.0007 |
| Diamond Invalidation | 838,233 | 0.0012 | 0.0013 |
| Dispose (x1000) | 2,185 | 0.4576 | 0.9834 |
| Dispose Chain | 308,835 | 0.0032 | 0.0034 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 691,437 | 0.0014 | 0.0017 |
| Create (Multiple Deps) | 442,302 | 0.0023 | 0.0026 |
| Create 10 Effects | 89,852 | 0.0111 | 0.0206 |
| Execution (Dep Change) (x1000) | 15,954 | 0.0627 | 0.0797 |
| Execution (Multiple) (x1000) | 7,571 | 0.1321 | 0.1503 |
| With Computed Dep (x1000) | 16,697 | 0.0599 | 0.0687 |
| Re-runs (10 times) | 1,064,947 | 0.0009 | 0.0010 |
| Multiple on Same Dep (x1000) | 16,182 | 0.0618 | 0.0710 |
| With Cleanup | 581,860 | 0.0017 | 0.0022 |
| Cleanup on Dep Change (x1000) | 16,738 | 0.0597 | 0.0684 |
| Dispose | 726,567 | 0.0014 | 0.0017 |
| Dispose (with Cleanup) | 708,742 | 0.0014 | 0.0016 |
| Dispose 10 Effects | 87,399 | 0.0114 | 0.0209 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,761 | 0.1736 | 0.2444 |
| Batch Update (10) (x1000) | 2,619 | 0.3818 | 0.4558 |
| Batch Update (100) | 371,715 | 0.0027 | 0.0029 |
| Without Batch (10) | 829,318 | 0.0012 | 0.0013 |
| With Batch (10) | 293,390 | 0.0034 | 0.0038 |
| Nested Batch (2 levels) (x1000) | 3,520 | 0.2841 | 0.3741 |
| Nested Batch (5 levels) (x1000) | 1,592 | 0.6278 | 0.7308 |
| Batch with Computed | 566,901 | 0.0018 | 0.0020 |
| Batch with Diamond | 630,261 | 0.0016 | 0.0018 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 3,578 | 0.2794 | 0.3190 |
| 1 to N (Fan Out 1000) | 5,244 | 0.1907 | 0.4016 |
| N to 1 (Fan In 1000) | 25,504 | 0.0392 | 0.0487 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 4,198 | 0.2382 | 0.6453 |
| Create/Dispose 1K Computeds | 3,045 | 0.3283 | 0.7855 |
| Create/Dispose 1K Effects | 245 | 4.0768 | 4.7266 |
| Rapid GC (10K Cycles) | 574 | 1.7414 | 2.1768 |
| Subscription Churn (1K) | 27,623 | 0.0362 | 0.1567 |
| Object Pooling (10K) | 21 | 46.7498 | 47.6325 |
| Weak Reference Cleanup (1K) | 2,972 | 0.3364 | 0.7951 |
| Effect Cleanup (1K) | 117 | 8.4845 | 9.2667 |
| Circular Reference Cleanup | 22,882 | 0.0437 | 0.0730 |
| Large State Tree (10K) | 993 | 1.0067 | 1.6902 |
| Memory Usage Monitoring | 198 | 5.0451 | 5.6419 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,957 | 0.2017 | 0.3587 |
| [Atom] Initialize | 4,945 | 0.2022 | 0.3961 |
| [Vanilla] Sort (Name) | 4,533 | 0.2206 | 0.2463 |
| [Atom] Sort (Name) | 2,374 | 0.4212 | 0.4976 |
| [Vanilla] Filter (Department) | 510,791 | 0.0020 | 0.0024 |
| [Atom] Filter (Department) | 34,584 | 0.0289 | 0.0386 |
| [Vanilla] Sort + Filter + Paginate | 4,122 | 0.2426 | 0.2677 |
| [Atom] Sort + Filter + Paginate | 2,304 | 0.4340 | 0.4790 |
| Select/Deselect Rows | 2,446 | 0.4087 | 0.7314 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 36,174 | 0.0276 | 0.0391 |
| Wide Fan-out (1→100) | 50,817 | 0.0197 | 0.0289 |
| Diamond Pattern | 168,977 | 0.0059 | 0.0066 |
| Pyramid (50 levels) | 60,696 | 0.0165 | 0.0262 |
| Mixed (100A, 200C) | 147,654 | 0.0068 | 0.0075 |
| Circular Avoidance | 751,013 | 0.0013 | 0.0015 |
| Conditional Deps | 936,676 | 0.0011 | 0.0013 |
| Array Dynamic Deps | 954,823 | 0.0010 | 0.0013 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 908,932 | 0.0011 | 0.0019 |
| Toggle Completion | 17,639 | 0.0567 | 0.0747 |
| Filter (Active/Completed) | 1,054,638 | 0.0009 | 0.0013 |
| Delete (50 from 100) | 43,291 | 0.0231 | 0.0458 |
| Complete Workflow | 225,188 | 0.0044 | 0.0089 |
| Stats with Auto-update | 630,444 | 0.0016 | 0.0028 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 71,199 | 0.0140 | 0.0233 |
| Updates per frame (100 atoms, batched) | 42,106 | 0.0237 | 0.0348 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 8,712 | 0.1148 | 0.2246 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 216,110 | 0.0046 | 0.0081 |
| Form reset (no batch) | 641,602 | 0.0016 | 0.0022 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 789,368 | 0.0013 | 0.0017 |
