# Benchmark Results - Detailed

**Last Updated**: 2026-03-29
**Version**: v0.26.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 6,651 | 0.1503 | 0.6809 |
| Create 1000 Atoms (Objects) | 6,682 | 0.1496 | 0.6958 |
| Read 1000 Atoms (Value) | 38,245 | 0.0261 | 0.0312 |
| Read 1000 Atoms (Peek) | 733,712 | 0.0014 | 0.0014 |
| Write 1000 Atoms | 372,525 | 0.0027 | 0.0033 |
| Subscribe/Unsubscribe (x100) | 241,498 | 0.0041 | 0.0061 |
| Notify 1 Subscriber (x1000) | 34,273 | 0.0292 | 0.0346 |
| Untracked Read (x1000) | 37,996 | 0.0263 | 0.0314 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,205 | 0.4535 | 1.1761 |
| Create (3 Deps) (x1000) | 1,325 | 0.7543 | 1.3983 |
| Create Chain (100) | 19,031 | 0.0525 | 0.0759 |
| Read (Single Dep) (x1000) | 40,184 | 0.0249 | 0.0297 |
| Read (Multiple) (x1000) | 40,015 | 0.0250 | 0.0419 |
| Nested Computation (x1000) | 32,181 | 0.0311 | 0.0360 |
| Recompute (Single Dep) (x1000) | 11,797 | 0.0848 | 0.1481 |
| Recompute (Chain of 10) | 333,991 | 0.0030 | 0.0033 |
| No Recompute (Unchanged) (x1000) | 38,050 | 0.0263 | 0.0313 |
| Lazy (Not Accessed) (x1000) | 2,260 | 0.4424 | 1.1342 |
| Lazy (Accessed Once) (x1000) | 1,415 | 0.7065 | 1.5919 |
| Lazy (Multiple Access) (x1000) | 1,287 | 0.7769 | 1.8199 |
| Cache Invalidation (x1000) | 14,253 | 0.0702 | 0.0767 |
| Diamond Invalidation (x1000) | 14,065 | 0.0711 | 0.0780 |
| Dispose (x1000) | 2,364 | 0.4230 | 1.1481 |
| Dispose Chain | 333,680 | 0.0030 | 0.0038 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 984 | 1.0162 | 1.9691 |
| Create (Multiple Deps) (x1000) | 587 | 1.7008 | 2.7257 |
| Create 10 Effects | 96,984 | 0.0103 | 0.0176 |
| Execution (Dep Change) (x1000) | 17,782 | 0.0562 | 0.0628 |
| Execution (Multiple) (x1000) | 8,289 | 0.1206 | 0.1313 |
| With Computed Dep (x1000) | 18,771 | 0.0533 | 0.0586 |
| Re-runs (10 times) (x1000) | 1,800 | 0.5553 | 0.5859 |
| Multiple on Same Dep (x1000) | 17,090 | 0.0585 | 0.0643 |
| With Cleanup (x1000) | 18,364 | 0.0545 | 0.0603 |
| Cleanup on Dep Change (x1000) | 18,364 | 0.0545 | 0.0603 |
| Dispose (x1000) | 1,005 | 0.9944 | 1.8898 |
| Dispose (with Cleanup) (x1000) | 972 | 1.0285 | 2.0011 |
| Dispose 10 Effects | 91,546 | 0.0109 | 0.0183 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,950 | 0.1681 | 0.2655 |
| Batch Update (10) (x1000) | 2,728 | 0.3665 | 0.4838 |
| Batch Update (100) (x1000) | 425 | 2.3482 | 2.5161 |
| Without Batch (10) (x1000) | 2,886 | 0.3465 | 0.3873 |
| With Batch (10) (x1000) | 318 | 3.1428 | 3.4666 |
| Nested Batch (2 levels) (x1000) | 4,165 | 0.2401 | 0.3374 |
| Nested Batch (5 levels) (x1000) | 1,959 | 0.5102 | 0.7378 |
| Batch with Computed (x1000) | 623 | 1.6037 | 1.7576 |
| Batch with Diamond (x1000) | 733 | 1.3625 | 1.5491 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 3,577 | 0.2795 | 0.3293 |
| 1 to N (Fan Out 1000) | 5,148 | 0.1942 | 0.3730 |
| N to 1 (Fan In 1000) | 24,791 | 0.0403 | 0.0507 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (x1000) | 99,544 | 0.0100 | 0.0146 |
| Array: Push 4 items (baseline) (x1000) | 55,636 | 0.0180 | 0.1078 |
| SlotBuffer: Add 16 items (spill) (x1000) | 13,066 | 0.0765 | 0.1956 |
| Array: Push 16 items (baseline) (x1000) | 23,439 | 0.0427 | 0.1371 |
| SlotBuffer: Churn (8 rem + 8 add) (x1000) | 3,964 | 0.2522 | 0.3813 |
| DepSlotBuffer: Seal + isDirty (4 items) (x1000) | 38,712 | 0.0258 | 0.0309 |
| DepSlotBuffer: Claim existing (Inline hit) (x1000) | 22,854 | 0.0438 | 0.0502 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 4,449 | 0.2247 | 0.8060 |
| Create/Dispose 1K Computeds | 3,085 | 0.3241 | 0.9922 |
| Create/Dispose 1K Effects | 283 | 3.5256 | 4.6648 |
| Rapid GC (10K Cycles) | 600 | 1.6646 | 2.2879 |
| Subscription Churn (1K) | 27,598 | 0.0362 | 0.1655 |
| Object Pooling (10K) | 22 | 43.7508 | 46.6812 |
| Weak Reference Cleanup (1K) | 3,038 | 0.3291 | 1.0753 |
| Effect Cleanup (1K) | 128 | 7.8099 | 8.8025 |
| Circular Reference Cleanup | 23,550 | 0.0425 | 0.0677 |
| Large State Tree (10K) | 1,002 | 0.9979 | 1.8341 |
| Memory Usage Monitoring | 213 | 4.6784 | 5.9107 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,525 | 0.2210 | 0.4626 |
| [Atom] Initialize | 4,430 | 0.2257 | 0.4844 |
| [Vanilla] Sort (Name) | 4,433 | 0.2256 | 0.3385 |
| [Atom] Sort (Name) | 2,284 | 0.4378 | 0.7625 |
| [Vanilla] Filter (Department) | 468,388 | 0.0021 | 0.0027 |
| [Atom] Filter (Department) | 37,650 | 0.0266 | 0.0326 |
| [Vanilla] Sort + Filter + Paginate | 4,479 | 0.2233 | 0.2442 |
| [Atom] Sort + Filter + Paginate | 2,287 | 0.4372 | 0.4806 |
| Select/Deselect Rows | 2,353 | 0.4250 | 0.7938 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 37,567 | 0.0266 | 0.0324 |
| Wide Fan-out (1→100) | 50,429 | 0.0198 | 0.0251 |
| Diamond Pattern | 177,564 | 0.0056 | 0.0076 |
| Pyramid (50 levels) | 61,197 | 0.0163 | 0.0219 |
| Mixed (100A, 200C) | 151,034 | 0.0066 | 0.0081 |
| Circular Avoidance | 800,048 | 0.0012 | 0.0016 |
| Conditional Deps (x1000) | 5,161 | 0.1938 | 0.2169 |
| Array Dynamic Deps (x1000) | 5,344 | 0.1871 | 0.2021 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 58,459 | 0.0171 | 0.0290 |
| Toggle Completion | 645,786 | 0.0015 | 0.0021 |
| Filter (Active/Completed) (x1000) | 5,914 | 0.1691 | 0.2710 |
| Delete (50 from 100) | 122,267 | 0.0082 | 0.0303 |
| Complete Workflow | 322,038 | 0.0031 | 0.0062 |
| Stats with Auto-update | 103,796 | 0.0096 | 0.0207 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 77,292 | 0.0129 | 0.0195 |
| Updates per frame (100 atoms, batched) | 41,988 | 0.0238 | 0.0310 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 492 | 2.0309 | 3.2423 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 219,949 | 0.0045 | 0.0095 |
| Form reset (no batch) | 652,330 | 0.0015 | 0.0024 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency (pure propagation) | 120.76 | 8.2809 | 9.3076 |
