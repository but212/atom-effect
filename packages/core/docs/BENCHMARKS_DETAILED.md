# Benchmark Results - Detailed

**Last Updated**: 2026-03-21
**Version**: v0.23.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 6,768 | 0.1477 | 0.5712 |
| Create 1000 Atoms (Objects) | 6,377 | 0.1568 | 0.5832 |
| Read 1000 Atoms (Value) | 37,163 | 0.0269 | 0.0343 |
| Read 1000 Atoms (Peek) | 729,487 | 0.0014 | 0.0014 |
| Write 1000 Atoms | 336,166 | 0.0030 | 0.0057 |
| Subscribe/Unsubscribe (x100) | 252,368 | 0.0040 | 0.0067 |
| Notify 1 Subscriber (x1000) | 29,670 | 0.0337 | 0.0413 |
| Untracked Read (x1000) | 36,868 | 0.0271 | 0.0349 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 1,861 | 0.5373 | 1.1353 |
| Create (3 Deps) (x1000) | 1,171 | 0.8533 | 1.4170 |
| Create Chain (100) | 18,442 | 0.0542 | 0.0736 |
| Read (Single Dep) (x1000) | 38,446 | 0.0260 | 0.0333 |
| Read (Multiple) (x1000) | 37,761 | 0.0265 | 0.0484 |
| Nested Computation (x1000) | 38,608 | 0.0259 | 0.0333 |
| Recompute (Single Dep) | 1,778,179 | 0.0006 | 0.0008 |
| Recompute (Chain of 10) | 537,701 | 0.0019 | 0.0028 |
| No Recompute (Unchanged) (x1000) | 37,526 | 0.0266 | 0.0392 |
| Lazy (Not Accessed) (x1000) | 2,199 | 0.4546 | 1.3401 |
| Lazy (Accessed Once) | 946,671 | 0.0011 | 0.0013 |
| Lazy (Multiple Access) | 875,784 | 0.0011 | 0.0018 |
| Cache Invalidation | 1,764,921 | 0.0006 | 0.0007 |
| Diamond Invalidation | 1,029,116 | 0.0010 | 0.0011 |
| Dispose (x1000) | 2,114 | 0.4730 | 1.1446 |
| Dispose Chain | 307,742 | 0.0032 | 0.0036 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 810,730 | 0.0012 | 0.0015 |
| Create (Multiple Deps) | 483,521 | 0.0021 | 0.0025 |
| Create 10 Effects | 85,171 | 0.0117 | 0.0209 |
| Execution (Dep Change) (x1000) | 17,701 | 0.0565 | 0.0657 |
| Execution (Multiple) (x1000) | 8,090 | 0.1236 | 0.1326 |
| With Computed Dep (x1000) | 16,644 | 0.0601 | 0.0683 |
| Re-runs (10 times) | 1,191,729 | 0.0008 | 0.0010 |
| Multiple on Same Dep (x1000) | 18,733 | 0.0534 | 0.0637 |
| With Cleanup | 570,125 | 0.0018 | 0.0023 |
| Cleanup on Dep Change (x1000) | 18,735 | 0.0534 | 0.0618 |
| Dispose | 714,816 | 0.0014 | 0.0017 |
| Dispose (with Cleanup) | 749,975 | 0.0013 | 0.0017 |
| Dispose 10 Effects | 84,891 | 0.0118 | 0.0209 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,593 | 0.1788 | 0.2682 |
| Batch Update (10) (x1000) | 2,327 | 0.4296 | 0.6295 |
| Batch Update (100) | 371,880 | 0.0027 | 0.0028 |
| Without Batch (10) | 872,873 | 0.0011 | 0.0013 |
| With Batch (10) | 313,063 | 0.0032 | 0.0038 |
| Nested Batch (2 levels) (x1000) | 3,299 | 0.3031 | 0.4162 |
| Nested Batch (5 levels) (x1000) | 1,468 | 0.6811 | 0.8497 |
| Batch with Computed | 619,032 | 0.0016 | 0.0020 |
| Batch with Diamond | 740,575 | 0.0014 | 0.0020 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 6,653 | 0.1503 | 0.2870 |
| 1 to N (Fan Out 1000) | 6,138 | 0.1629 | 0.1836 |
| N to 1 (Fan In 1000) | 28,272 | 0.0354 | 0.0505 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 4,103 | 0.2437 | 0.6585 |
| Create/Dispose 1K Computeds | 2,947 | 0.3393 | 0.8516 |
| Create/Dispose 1K Effects | 262 | 3.8127 | 4.6618 |
| Rapid GC (10K Cycles) | 605 | 1.6522 | 2.1075 |
| Subscription Churn (1K) | 27,003 | 0.0370 | 0.1560 |
| Object Pooling (10K) | 21 | 46.9080 | 48.4508 |
| Weak Reference Cleanup (1K) | 2,907 | 0.3439 | 0.8581 |
| Effect Cleanup (1K) | 117 | 8.5204 | 9.4739 |
| Circular Reference Cleanup | 22,784 | 0.0439 | 0.0538 |
| Large State Tree (10K) | 984 | 1.0155 | 1.8306 |
| Memory Usage Monitoring | 195 | 5.1173 | 5.8187 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,561 | 0.2192 | 0.4187 |
| [Atom] Initialize | 4,610 | 0.2169 | 0.4206 |
| [Vanilla] Sort (Name) | 4,512 | 0.2216 | 0.2522 |
| [Atom] Sort (Name) | 2,430 | 0.4114 | 0.5398 |
| [Vanilla] Filter (Department) | 493,041 | 0.0020 | 0.0026 |
| [Atom] Filter (Department) | 35,664 | 0.0280 | 0.0369 |
| [Vanilla] Sort + Filter + Paginate | 4,312 | 0.2319 | 0.2695 |
| [Atom] Sort + Filter + Paginate | 2,369 | 0.4220 | 0.4726 |
| Select/Deselect Rows | 2,341 | 0.4271 | 0.7871 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 70,908 | 0.0141 | 0.0236 |
| Wide Fan-out (1→100) | 60,001 | 0.0167 | 0.0258 |
| Diamond Pattern | 244,643 | 0.0041 | 0.0065 |
| Pyramid (50 levels) | 102,058 | 0.0098 | 0.0188 |
| Mixed (100A, 200C) | 164,114 | 0.0061 | 0.0070 |
| Circular Avoidance | 969,821 | 0.0010 | 0.0012 |
| Conditional Deps | 992,788 | 0.0010 | 0.0013 |
| Array Dynamic Deps | 969,047 | 0.0010 | 0.0014 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 848,393 | 0.0012 | 0.0022 |
| Toggle Completion | 17,336 | 0.0577 | 0.0911 |
| Filter (Active/Completed) | 1,132,567 | 0.0009 | 0.0013 |
| Delete (50 from 100) | 41,114 | 0.0243 | 0.0486 |
| Complete Workflow | 201,273 | 0.0050 | 0.0107 |
| Stats with Auto-update | 575,043 | 0.0017 | 0.0031 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 71,487 | 0.0140 | 0.0234 |
| Updates per frame (100 atoms, batched) | 44,436 | 0.0225 | 0.0334 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 8,933 | 0.1119 | 0.2293 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 224,941 | 0.0044 | 0.0091 |
| Form reset (no batch) | 634,773 | 0.0016 | 0.0023 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 828,125 | 0.0012 | 0.0015 |
