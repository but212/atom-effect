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
| Create 1000 Atoms (Primitives) | 7,909 | 0.1264 | 0.7667 |
| Create 1000 Atoms (Objects) | 7,443 | 0.1343 | 0.7925 |
| Read 1000 Atoms (Value) | 36,011 | 0.0278 | 0.0503 |
| Read 1000 Atoms (Peek) | 512,374 | 0.0020 | 0.0113 |
| Write 1000 Atoms | 340,348 | 0.0029 | 0.0125 |
| Subscribe/Unsubscribe (x100) | 316,115 | 0.0032 | 0.1142 |
| Notify 1 Subscriber (x1000) | 27,693 | 0.0361 | 0.0745 |
| Untracked Read (x1000) | 36,424 | 0.0275 | 0.0560 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,239 | 0.4466 | 1.7652 |
| Create (3 Deps) (x1000) | 1,308 | 0.7643 | 1.9660 |
| Create Chain (100) | 14,176 | 0.0705 | 0.8328 |
| Read (Single Dep) (x1000) | 38,459 | 0.0260 | 0.0633 |
| Read (Multiple) (x1000) | 39,425 | 0.0254 | 0.0553 |
| Nested Computation (x1000) | 39,266 | 0.0255 | 0.0474 |
| Recompute (Single Dep) | 1,683,497 | 0.0006 | 0.0014 |
| Recompute (Chain of 10) | 474,491 | 0.0021 | 0.0108 |
| No Recompute (Unchanged) (x1000) | 34,189 | 0.0292 | 0.0551 |
| Lazy (Not Accessed) (x1000) | 2,293 | 0.4359 | 1.5721 |
| Lazy (Accessed Once) | 810,339 | 0.0012 | 0.0106 |
| Lazy (Multiple Access) | 750,389 | 0.0013 | 0.0107 |
| Cache Invalidation | 1,640,137 | 0.0006 | 0.0015 |
| Diamond Invalidation | 967,401 | 0.0010 | 0.0095 |
| Dispose (x1000) | 1,913 | 0.5227 | 1.7268 |
| Dispose Chain | 271,438 | 0.0037 | 0.0150 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 642,511 | 0.0016 | 0.0112 |
| Create (Multiple Deps) | 464,546 | 0.0022 | 0.0121 |
| Create 10 Effects | 81,564 | 0.0123 | 0.0324 |
| Execution (Dep Change) (x1000) | 17,324 | 0.0577 | 0.0941 |
| Execution (Multiple) (x1000) | 8,482 | 0.1179 | 0.2484 |
| With Computed Dep (x1000) | 16,161 | 0.0619 | 0.1263 |
| Re-runs (10 times) | 1,150,633 | 0.0009 | 0.0023 |
| Multiple on Same Dep (x1000) | 17,223 | 0.0581 | 0.1223 |
| With Cleanup | 532,701 | 0.0019 | 0.0120 |
| Cleanup on Dep Change (x1000) | 17,392 | 0.0575 | 0.0914 |
| Dispose | 646,977 | 0.0015 | 0.0114 |
| Dispose (with Cleanup) | 640,799 | 0.0016 | 0.0114 |
| Dispose 10 Effects | 80,597 | 0.0124 | 0.0377 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,688 | 0.1758 | 0.3689 |
| Batch Update (10) (x1000) | 2,426 | 0.4121 | 0.6774 |
| Batch Update (100) | 332,580 | 0.0030 | 0.0114 |
| Without Batch (10) | 846,381 | 0.0012 | 0.0100 |
| With Batch (10) | 300,130 | 0.0033 | 0.0129 |
| Nested Batch (2 levels) (x1000) | 3,794 | 0.2636 | 0.4401 |
| Nested Batch (5 levels) (x1000) | 1,607 | 0.6222 | 0.8602 |
| Batch with Computed | 645,649 | 0.0015 | 0.0104 |
| Batch with Diamond | 759,660 | 0.0013 | 0.0101 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 5,506 | 0.1816 | 0.4030 |
| 1 to N (Fan Out 1000) | 5,049 | 0.1980 | 0.3119 |
| N to 1 (Fan In 1000) | 33,653 | 0.0297 | 0.0770 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,963 | 0.2523 | 0.9861 |
| Create/Dispose 1K Computeds | 2,515 | 0.3976 | 1.1276 |
| Create/Dispose 1K Effects | 369 | 2.7098 | 4.5171 |
| Rapid GC (10K Cycles) | 469 | 2.1294 | 2.8126 |
| Subscription Churn (1K) | 35,869 | 0.0279 | 0.1659 |
| Object Pooling (10K) | 17 | 58.5245 | 59.5768 |
| Weak Reference Cleanup (1K) | 2,472 | 0.4044 | 1.2528 |
| Effect Cleanup (1K) | 113 | 8.8158 | 10.8390 |
| Circular Reference Cleanup | 19,723 | 0.0507 | 1.0307 |
| Large State Tree (10K) | 460 | 2.1699 | 12.8399 |
| Memory Usage Monitoring | 160 | 6.2414 | 7.3528 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,643 | 0.2154 | 0.5116 |
| [Atom] Initialize | 4,695 | 0.2130 | 0.5147 |
| [Vanilla] Sort (Name) | 4,413 | 0.2266 | 0.4558 |
| [Atom] Sort (Name) | 2,399 | 0.4167 | 0.8562 |
| [Vanilla] Filter (Department) | 490,925 | 0.0020 | 0.0121 |
| [Atom] Filter (Department) | 34,458 | 0.0290 | 0.0573 |
| [Vanilla] Sort + Filter + Paginate | 4,278 | 0.2337 | 0.4994 |
| [Atom] Sort + Filter + Paginate | 2,336 | 0.4280 | 0.8569 |
| Select/Deselect Rows | 1,861 | 0.5372 | 0.9625 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 61,314 | 0.0163 | 0.0353 |
| Wide Fan-out (1→100) | 52,831 | 0.0189 | 0.0595 |
| Diamond Pattern | 224,945 | 0.0044 | 0.0136 |
| Pyramid (50 levels) | 86,761 | 0.0115 | 0.0252 |
| Mixed (100A, 200C) | 152,121 | 0.0066 | 0.0278 |
| Circular Avoidance | 883,915 | 0.0011 | 0.0098 |
| Conditional Deps | 720,984 | 0.0014 | 0.0105 |
| Array Dynamic Deps | 732,138 | 0.0014 | 0.0104 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 823,432 | 0.0012 | 0.0176 |
| Toggle Completion | 9,269 | 0.1079 | 0.2468 |
| Filter (Active/Completed) | 1,101,583 | 0.0009 | 0.0039 |
| Delete (50 from 100) | 42,513 | 0.0235 | 0.1686 |
| Complete Workflow | 180,636 | 0.0055 | 0.3395 |
| Stats with Auto-update | 513,450 | 0.0019 | 0.0288 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 84,009 | 0.0119 | 0.0318 |
| Updates per frame (100 atoms, batched) | 45,228 | 0.0221 | 0.0480 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 7,231 | 0.1383 | 1.7436 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 213,529 | 0.0047 | 0.0194 |
| Form reset (no batch) | 613,195 | 0.0016 | 0.0118 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 1,122,578 | 0.0009 | 0.0052 |
