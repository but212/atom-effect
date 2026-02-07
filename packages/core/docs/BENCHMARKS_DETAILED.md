# Benchmark Results - Detailed

**Last Updated**: 2026-02-08  
**Version**: v0.18.0  
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 8,453 | 0.1183 | 0.7130 |
| Create 1000 Atoms (Objects) | 8,444 | 0.1184 | 0.7569 |
| Read 1000 Atoms (Value) | 36,193 | 0.0276 | 0.0364 |
| Read 1000 Atoms (Peek) | 528,092 | 0.0019 | 0.0020 |
| Write 1000 Atoms | 334,772 | 0.0030 | 0.0047 |
| Subscribe/Unsubscribe (x100) | 299,794 | 0.0033 | 0.0060 |
| Notify 1 Subscriber (x1000) | 26,711 | 0.0374 | 0.0470 |
| Untracked Read (x1000) | 36,147 | 0.0277 | 0.0355 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,554 | 0.3914 | 1.1109 |
| Create (3 Deps) (x1000) | 1,558 | 0.6418 | 1.3000 |
| Create Chain (100) | 11,444 | 0.0874 | 0.1171 |
| Read (Single Dep) (x1000) | 13,716 | 0.0729 | 0.0835 |
| Read (Multiple) (x1000) | 12,967 | 0.0771 | 0.1049 |
| Nested Computation (x1000) | 12,624 | 0.0792 | 0.1605 |
| Recompute (Single Dep) | 796,534 | 0.0013 | 0.0016 |
| Recompute (Chain of 10) | 148,659 | 0.0067 | 0.0130 |
| No Recompute (Unchanged) (x1000) | 12,833 | 0.0779 | 0.0972 |
| Lazy (Not Accessed) (x1000) | 2,730 | 0.3662 | 1.0524 |
| Lazy (Accessed Once) | 705,166 | 0.0014 | 0.0018 |
| Lazy (Multiple Access) | 618,027 | 0.0016 | 0.0019 |
| Cache Invalidation | 783,188 | 0.0013 | 0.0021 |
| Diamond Invalidation | 368,267 | 0.0027 | 0.0031 |
| Dispose (x1000) | 2,010 | 0.4974 | 1.2045 |
| Dispose Chain | 277,113 | 0.0036 | 0.0047 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 302,360 | 0.0033 | 0.0055 |
| Create (Multiple Deps) | 240,473 | 0.0042 | 0.0054 |
| Create 10 Effects | 35,661 | 0.0280 | 0.0497 |
| Execution (Dep Change) (x1000) | 15,364 | 0.0651 | 0.0857 |
| Execution (Multiple) (x1000) | 7,529 | 0.1328 | 0.2689 |
| With Computed Dep (x1000) | 14,507 | 0.0689 | 0.0903 |
| Re-runs (10 times) | 955,684 | 0.0010 | 0.0014 |
| Multiple on Same Dep (x1000) | 16,876 | 0.0593 | 0.0781 |
| With Cleanup | 270,420 | 0.0037 | 0.0045 |
| Cleanup on Dep Change (x1000) | 14,921 | 0.0670 | 0.0806 |
| Dispose | 316,815 | 0.0032 | 0.0046 |
| Dispose (with Cleanup) | 314,937 | 0.0032 | 0.0038 |
| Dispose 10 Effects | 35,556 | 0.0281 | 0.0515 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 3,645 | 0.2743 | 0.3517 |
| Batch Update (10) (x1000) | 1,850 | 0.5405 | 0.6364 |
| Batch Update (100) | 286,573 | 0.0035 | 0.0050 |
| Without Batch (10) | 558,948 | 0.0018 | 0.0021 |
| With Batch (10) | 176,647 | 0.0057 | 0.0068 |
| Nested Batch (2 levels) (x1000) | 2,279 | 0.4386 | 0.5987 |
| Nested Batch (5 levels) (x1000) | 1,062 | 0.9411 | 1.1604 |
| Batch with Computed | 296,244 | 0.0034 | 0.0040 |
| Batch with Diamond | 294,651 | 0.0034 | 0.0040 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,680 | 0.5951 | 1.0899 |
| 1 to N (Fan Out 1000) | 1,423 | 0.7026 | 1.0736 |
| N to 1 (Fan In 1000) | 11,357 | 0.0881 | 0.1757 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,969 | 0.2519 | 0.8653 |
| Create/Dispose 1K Computeds | 2,605 | 0.3838 | 1.0706 |
| Create/Dispose 1K Effects | 295 | 3.3861 | 4.1460 |
| Rapid GC (10K Cycles) | 524 | 1.9063 | 2.6082 |
| Subscription Churn (1K) | 32,041 | 0.0312 | 0.1377 |
| Object Pooling (10K) | 16 | 58.8256 | 59.0215 |
| Weak Reference Cleanup (1K) | 2,592 | 0.3858 | 1.0961 |
| Effect Cleanup (1K) | 105 | 9.4454 | 10.4750 |
| Circular Reference Cleanup | 20,704 | 0.0483 | 0.0685 |
| Large State Tree (10K) | 759 | 1.3170 | 2.0983 |
| Memory Usage Monitoring | 160 | 6.2331 | 7.2572 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,629 | 0.2160 | 0.4201 |
| [Atom] Initialize | 4,667 | 0.2143 | 0.4333 |
| [Vanilla] Sort (Name) | 4,350 | 0.2298 | 0.2685 |
| [Atom] Sort (Name) | 1,798 | 0.5561 | 0.6753 |
| [Vanilla] Filter (Department) | 436,414 | 0.0023 | 0.0032 |
| [Atom] Filter (Department) | 24,781 | 0.0404 | 0.0491 |
| [Vanilla] Sort + Filter + Paginate | 4,234 | 0.2362 | 0.3119 |
| [Atom] Sort + Filter + Paginate | 1,865 | 0.5360 | 0.7153 |
| Select/Deselect Rows | 1,928 | 0.5184 | 0.7241 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 18,120 | 0.0552 | 0.0721 |
| Wide Fan-out (1→100) | 15,373 | 0.0650 | 0.0801 |
| Diamond Pattern | 70,326 | 0.0142 | 0.0231 |
| Pyramid (50 levels) | 26,410 | 0.0379 | 0.0492 |
| Mixed (100A, 200C) | 54,293 | 0.0184 | 0.0261 |
| Circular Avoidance | 337,251 | 0.0030 | 0.0037 |
| Conditional Deps | 513,800 | 0.0019 | 0.0024 |
| Array Dynamic Deps | 521,109 | 0.0019 | 0.0024 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 782,041 | 0.0013 | 0.0023 |
| Toggle Completion | 9,263 | 0.1079 | 0.1343 |
| Filter (Active/Completed) | 607,435 | 0.0016 | 0.0025 |
| Delete (50 from 100) | 41,985 | 0.0238 | 0.0469 |
| Complete Workflow | 176,114 | 0.0057 | 0.0118 |
| Stats with Auto-update | 491,408 | 0.0020 | 0.0046 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 51,824 | 0.0193 | 0.0413 |
| Updates per frame (100 atoms, batched) | 27,429 | 0.0365 | 0.0924 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 4,128 | 0.2422 | 0.9367 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 135,872 | 0.0074 | 0.0156 |
| Form reset (no batch) | 439,527 | 0.0023 | 0.0036 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 778,307 | 0.0013 | 0.0018 |
