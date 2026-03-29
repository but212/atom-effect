# Benchmark Results - Detailed

**Last Updated**: 2026-03-29
**Version**: v0.25.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 7,042 | 0.1420 | 0.5345 |
| Create 1000 Atoms (Objects) | 7,180 | 0.1393 | 0.5383 |
| Read 1000 Atoms (Value) | 38,912 | 0.0257 | 0.0342 |
| Read 1000 Atoms (Peek) | 666,557 | 0.0015 | 0.0015 |
| Write 1000 Atoms | 324,417 | 0.0031 | 0.0058 |
| Subscribe/Unsubscribe (x100) | 260,810 | 0.0038 | 0.0056 |
| Notify 1 Subscriber (x1000) | 27,884 | 0.0359 | 0.0447 |
| Untracked Read (x1000) | 39,328 | 0.0254 | 0.0340 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,062 | 0.4847 | 1.3462 |
| Create (3 Deps) (x1000) | 1,185 | 0.8434 | 1.7220 |
| Create Chain (100) | 17,852 | 0.0560 | 0.0994 |
| Read (Single Dep) (x1000) | 36,254 | 0.0276 | 0.0489 |
| Read (Multiple) (x1000) | 37,709 | 0.0265 | 0.0472 |
| Nested Computation (x1000) | 33,867 | 0.0295 | 0.0377 |
| Recompute (Single Dep) (x1000) | 9,977 | 0.1002 | 0.1216 |
| Recompute (Chain of 10) | 329,899 | 0.0030 | 0.0033 |
| No Recompute (Unchanged) (x1000) | 37,411 | 0.0267 | 0.0356 |
| Lazy (Not Accessed) (x1000) | 2,056 | 0.4862 | 1.1108 |
| Lazy (Accessed Once) (x1000) | 1,157 | 0.8641 | 1.9138 |
| Lazy (Multiple Access) (x1000) | 1,128 | 0.8864 | 1.5488 |
| Cache Invalidation (x1000) | 12,595 | 0.0794 | 0.0889 |
| Diamond Invalidation (x1000) | 11,815 | 0.0846 | 0.0953 |
| Dispose (x1000) | 2,139 | 0.4674 | 1.0675 |
| Dispose Chain | 316,733 | 0.0032 | 0.0036 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 821 | 1.2176 | 2.3172 |
| Create (Multiple Deps) (x1000) | 515 | 1.9385 | 2.9225 |
| Create 10 Effects | 84,650 | 0.0118 | 0.0228 |
| Execution (Dep Change) (x1000) | 17,501 | 0.0571 | 0.0824 |
| Execution (Multiple) (x1000) | 7,667 | 0.1304 | 0.1572 |
| With Computed Dep (x1000) | 18,668 | 0.0536 | 0.0632 |
| Re-runs (10 times) (x1000) | 1,761 | 0.5676 | 0.5944 |
| Multiple on Same Dep (x1000) | 17,773 | 0.0563 | 0.0672 |
| With Cleanup (x1000) | 17,919 | 0.0558 | 0.0646 |
| Cleanup on Dep Change (x1000) | 17,919 | 0.0558 | 0.0646 |
| Dispose (x1000) | 873 | 1.1444 | 2.0385 |
| Dispose (with Cleanup) (x1000) | 859 | 1.1638 | 2.0855 |
| Dispose 10 Effects | 87,395 | 0.0114 | 0.0219 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 6,041 | 0.1655 | 0.2370 |
| Batch Update (10) (x1000) | 2,691 | 0.3716 | 0.4476 |
| Batch Update (100) (x1000) | 384 | 2.6005 | 4.0794 |
| Without Batch (10) (x1000) | 2,591 | 0.3859 | 0.4433 |
| With Batch (10) (x1000) | 311 | 3.2098 | 3.3414 |
| Nested Batch (2 levels) (x1000) | 3,877 | 0.2579 | 0.3343 |
| Nested Batch (5 levels) (x1000) | 1,780 | 0.5615 | 0.6482 |
| Batch with Computed (x1000) | 654 | 1.5285 | 1.6483 |
| Batch with Diamond (x1000) | 734 | 1.3618 | 1.4809 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 3,321 | 0.3011 | 0.3575 |
| 1 to N (Fan Out 1000) | 4,524 | 0.2210 | 0.4317 |
| N to 1 (Fan In 1000) | 24,890 | 0.0402 | 0.0508 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (x1000) | 90,884 | 0.0110 | 0.0189 |
| Array: Push 4 items (baseline) (x1000) | 83,533 | 0.0120 | 0.0989 |
| SlotBuffer: Add 16 items (spill) (x1000) | 15,860 | 0.0631 | 0.1526 |
| Array: Push 16 items (baseline) (x1000) | 35,856 | 0.0279 | 0.1171 |
| SlotBuffer: Churn (8 rem + 8 add) (x1000) | 3,620 | 0.2762 | 0.3777 |
| DepSlotBuffer: Seal + isDirty (4 items) (x1000) | 33,416 | 0.0299 | 0.0382 |
| DepSlotBuffer: Claim existing (Inline hit) (x1000) | 21,369 | 0.0468 | 0.0562 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 4,406 | 0.2270 | 0.6525 |
| Create/Dispose 1K Computeds | 3,012 | 0.3320 | 0.8526 |
| Create/Dispose 1K Effects | 278 | 3.5951 | 4.4337 |
| Rapid GC (10K Cycles) | 581 | 1.7185 | 2.1719 |
| Subscription Churn (1K) | 27,178 | 0.0368 | 0.1560 |
| Object Pooling (10K) | 21 | 46.9909 | 50.3211 |
| Weak Reference Cleanup (1K) | 2,921 | 0.3423 | 0.8129 |
| Effect Cleanup (1K) | 121 | 8.2379 | 8.9389 |
| Circular Reference Cleanup | 21,362 | 0.0468 | 0.0624 |
| Large State Tree (10K) | 988 | 1.0112 | 1.6701 |
| Memory Usage Monitoring | 197 | 5.0606 | 5.7540 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,938 | 0.2025 | 0.3935 |
| [Atom] Initialize | 4,917 | 0.2034 | 0.4084 |
| [Vanilla] Sort (Name) | 4,492 | 0.2226 | 0.2538 |
| [Atom] Sort (Name) | 2,412 | 0.4145 | 0.5227 |
| [Vanilla] Filter (Department) | 501,359 | 0.0020 | 0.0025 |
| [Atom] Filter (Department) | 36,794 | 0.0272 | 0.0374 |
| [Vanilla] Sort + Filter + Paginate | 4,309 | 0.2320 | 0.3900 |
| [Atom] Sort + Filter + Paginate | 2,342 | 0.4269 | 0.4677 |
| Select/Deselect Rows | 2,487 | 0.4021 | 0.7147 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 37,167 | 0.0269 | 0.0411 |
| Wide Fan-out (1→100) | 48,060 | 0.0208 | 0.0306 |
| Diamond Pattern | 165,886 | 0.0060 | 0.0067 |
| Pyramid (50 levels) | 61,977 | 0.0161 | 0.0265 |
| Mixed (100A, 200C) | 147,257 | 0.0068 | 0.0110 |
| Circular Avoidance | 739,945 | 0.0014 | 0.0016 |
| Conditional Deps (x1000) | 4,752 | 0.2104 | 0.2267 |
| Array Dynamic Deps (x1000) | 5,191 | 0.1926 | 0.2163 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 846,264 | 0.0012 | 0.0020 |
| Toggle Completion | 17,985 | 0.0556 | 0.0775 |
| Filter (Active/Completed) (x1000) | 11,780 | 0.0849 | 0.1045 |
| Delete (50 from 100) | 43,691 | 0.0229 | 0.0473 |
| Complete Workflow | 215,476 | 0.0046 | 0.0097 |
| Stats with Auto-update | 594,615 | 0.0017 | 0.0033 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 74,152 | 0.0135 | 0.0241 |
| Updates per frame (100 atoms, batched) | 42,808 | 0.0234 | 0.0341 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 9,199 | 0.1087 | 0.2131 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 203,635 | 0.0049 | 0.0093 |
| Form reset (no batch) | 614,939 | 0.0016 | 0.0023 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency (x1000) | 2,001 | 0.4997 | 1.0137 |
