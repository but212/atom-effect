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
| Create 1000 Atoms (Primitives) | 8,241 | 0.1213 | 0.7064 |
| Create 1000 Atoms (Objects) | 8,483 | 0.1179 | 0.7043 |
| Read 1000 Atoms (Value) | 37,822 | 0.0264 | 0.0342 |
| Read 1000 Atoms (Peek) | 608,371 | 0.0016 | 0.0025 |
| Write 1000 Atoms | 343,734 | 0.0029 | 0.0030 |
| Subscribe/Unsubscribe (x100) | 221,235 | 0.0045 | 0.0062 |
| Notify 1 Subscriber (x1000) | 39,085 | 0.0256 | 0.0354 |
| Untracked Read (x1000) | 37,521 | 0.0267 | 0.0344 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,430 | 0.4115 | 1.4509 |
| Create (3 Deps) (x1000) | 1,538 | 0.6503 | 1.7345 |
| Create Chain (100) | 10,620 | 0.0942 | 0.1440 |
| Read (Single Dep) (x1000) | 13,939 | 0.0717 | 0.1457 |
| Read (Multiple) (x1000) | 13,167 | 0.0759 | 0.1297 |
| Nested Computation (x1000) | 13,253 | 0.0755 | 0.0845 |
| Recompute (Single Dep) | 746,944 | 0.0013 | 0.0024 |
| Recompute (Chain of 10) | 137,594 | 0.0073 | 0.0093 |
| No Recompute (Unchanged) (x1000) | 13,102 | 0.0763 | 0.0872 |
| Lazy (Not Accessed) (x1000) | 2,568 | 0.3894 | 1.3680 |
| Lazy (Accessed Once) | 630,329 | 0.0016 | 0.0018 |
| Lazy (Multiple Access) | 569,312 | 0.0018 | 0.0021 |
| Cache Invalidation | 747,296 | 0.0013 | 0.0023 |
| Diamond Invalidation | 342,139 | 0.0029 | 0.0048 |
| Dispose (x1000) | 1,853 | 0.5398 | 1.6273 |
| Dispose Chain | 246,742 | 0.0041 | 0.0046 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 299,005 | 0.0033 | 0.0055 |
| Create (Multiple Deps) | 235,075 | 0.0043 | 0.0057 |
| Create 10 Effects | 35,612 | 0.0281 | 0.0465 |
| Execution (Dep Change) (x1000) | 20,888 | 0.0479 | 0.0685 |
| Execution (Multiple) (x1000) | 9,134 | 0.1095 | 0.1366 |
| With Computed Dep (x1000) | 20,922 | 0.0478 | 0.0691 |
| Re-runs (10 times) | 1,105,056 | 0.0009 | 0.0013 |
| Multiple on Same Dep (x1000) | 20,892 | 0.0479 | 0.0600 |
| With Cleanup | 266,129 | 0.0038 | 0.0044 |
| Cleanup on Dep Change (x1000) | 20,961 | 0.0477 | 0.0600 |
| Dispose | 305,009 | 0.0033 | 0.0038 |
| Dispose (with Cleanup) | 304,795 | 0.0033 | 0.0036 |
| Dispose 10 Effects | 34,728 | 0.0288 | 0.0459 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 3,786 | 0.2641 | 0.3379 |
| Batch Update (10) (x1000) | 2,259 | 0.4427 | 0.5121 |
| Batch Update (100) | 414,098 | 0.0024 | 0.0039 |
| Without Batch (10) | 587,132 | 0.0017 | 0.0021 |
| With Batch (10) | 173,501 | 0.0058 | 0.0084 |
| Nested Batch (2 levels) (x1000) | 2,503 | 0.3996 | 0.5957 |
| Nested Batch (5 levels) (x1000) | 1,281 | 0.7809 | 0.9851 |
| Batch with Computed | 276,759 | 0.0036 | 0.0042 |
| Batch with Diamond | 273,059 | 0.0037 | 0.0042 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,511 | 0.6618 | 1.0458 |
| 1 to N (Fan Out 1000) | 1,314 | 0.7611 | 1.1161 |
| N to 1 (Fan In 1000) | 13,675 | 0.0731 | 0.1026 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,495 | 0.2861 | 0.9407 |
| Create/Dispose 1K Computeds | 2,324 | 0.4302 | 1.1373 |
| Create/Dispose 1K Effects | 846 | 1.1818 | 2.0048 |
| Rapid GC (10K Cycles) | 425 | 2.3553 | 3.0849 |
| Subscription Churn (1K) | 21,090 | 0.0474 | 0.1559 |
| Object Pooling (10K) | 17 | 58.3036 | 58.3879 |
| Weak Reference Cleanup (1K) | 2,319 | 0.4312 | 1.1412 |
| Effect Cleanup (1K) | 139 | 7.1846 | 8.0770 |
| Circular Reference Cleanup | 18,766 | 0.0533 | 0.0704 |
| Large State Tree (10K) | 484 | 2.0681 | 11.1396 |
| Memory Usage Monitoring | 158 | 6.3141 | 9.7015 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,652 | 0.2150 | 0.4064 |
| [Atom] Initialize | 4,676 | 0.2139 | 0.4262 |
| [Vanilla] Sort (Name) | 4,369 | 0.2289 | 0.2577 |
| [Atom] Sort (Name) | 1,952 | 0.5123 | 0.9747 |
| [Vanilla] Filter (Department) | 442,713 | 0.0023 | 0.0028 |
| [Atom] Filter (Department) | 24,244 | 0.0412 | 0.0504 |
| [Vanilla] Sort + Filter + Paginate | 4,187 | 0.2388 | 0.2686 |
| [Atom] Sort + Filter + Paginate | 1,920 | 0.5209 | 0.8234 |
| Select/Deselect Rows | 1,876 | 0.5329 | 0.7494 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 15,807 | 0.0633 | 0.0819 |
| Wide Fan-out (1→100) | 13,768 | 0.0726 | 0.0887 |
| Diamond Pattern | 64,216 | 0.0156 | 0.0240 |
| Pyramid (50 levels) | 24,866 | 0.0402 | 0.0521 |
| Mixed (100A, 200C) | 55,269 | 0.0181 | 0.0258 |
| Circular Avoidance | 317,134 | 0.0032 | 0.0038 |
| Conditional Deps | 495,836 | 0.0020 | 0.0024 |
| Array Dynamic Deps | 499,735 | 0.0020 | 0.0024 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 806,699 | 0.0012 | 0.0021 |
| Toggle Completion | 9,339 | 0.1071 | 0.2254 |
| Filter (Active/Completed) | 586,393 | 0.0017 | 0.0024 |
| Delete (50 from 100) | 43,591 | 0.0227 | 0.0461 |
| Complete Workflow | 172,312 | 0.0058 | 0.0117 |
| Stats with Auto-update | 483,873 | 0.0021 | 0.0046 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 55,756 | 0.0179 | 0.0268 |
| Updates per frame (100 atoms, batched) | 27,472 | 0.0364 | 0.0476 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 4,003 | 0.2498 | 0.9278 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 134,166 | 0.0075 | 0.0171 |
| Form reset (no batch) | 486,139 | 0.0021 | 0.0035 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 785,002 | 0.0013 | 0.0018 |
