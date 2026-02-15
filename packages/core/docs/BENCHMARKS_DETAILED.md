# Benchmark Results - Detailed

**Last Updated**: 2026-02-15
**Version**: v0.21.0
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 8,328 | 0.1201 | 0.7019 |
| Create 1000 Atoms (Objects) | 8,301 | 0.1205 | 0.7092 |
| Read 1000 Atoms (Value) | 37,816 | 0.0264 | 0.0345 |
| Read 1000 Atoms (Peek) | 612,083 | 0.0016 | 0.0018 |
| Write 1000 Atoms | 340,696 | 0.0029 | 0.0033 |
| Subscribe/Unsubscribe (x100) | 298,629 | 0.0033 | 0.0058 |
| Notify 1 Subscriber (x1000) | 27,067 | 0.0369 | 0.0470 |
| Untracked Read (x1000) | 37,983 | 0.0263 | 0.0360 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,866 | 0.3489 | 1.3852 |
| Create (3 Deps) (x1000) | 1,559 | 0.6413 | 1.7575 |
| Create Chain (100) | 14,244 | 0.0702 | 0.1377 |
| Read (Single Dep) (x1000) | 42,187 | 0.0237 | 0.0313 |
| Read (Multiple) (x1000) | 41,490 | 0.0241 | 0.0369 |
| Nested Computation (x1000) | 40,437 | 0.0247 | 0.0478 |
| Recompute (Single Dep) | 997,014 | 0.0010 | 0.0017 |
| Recompute (Chain of 10) | 189,577 | 0.0053 | 0.0090 |
| No Recompute (Unchanged) (x1000) | 33,650 | 0.0297 | 0.0397 |
| Lazy (Not Accessed) (x1000) | 2,990 | 0.3345 | 1.1096 |
| Lazy (Accessed Once) | 904,648 | 0.0011 | 0.0014 |
| Lazy (Multiple Access) | 807,424 | 0.0012 | 0.0017 |
| Cache Invalidation | 973,216 | 0.0010 | 0.0017 |
| Diamond Invalidation | 449,372 | 0.0022 | 0.0028 |
| Dispose (x1000) | 2,443 | 0.4093 | 1.2500 |
| Dispose Chain | 348,853 | 0.0029 | 0.0032 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 716,646 | 0.0014 | 0.0017 |
| Create (Multiple Deps) | 443,255 | 0.0023 | 0.0028 |
| Create 10 Effects | 85,877 | 0.0116 | 0.0206 |
| Execution (Dep Change) (x1000) | 14,559 | 0.0687 | 0.1252 |
| Execution (Multiple) (x1000) | 8,049 | 0.1242 | 0.1910 |
| With Computed Dep (x1000) | 16,742 | 0.0597 | 0.0778 |
| Re-runs (10 times) | 1,083,834 | 0.0009 | 0.0013 |
| Multiple on Same Dep (x1000) | 16,571 | 0.0603 | 0.0787 |
| With Cleanup | 565,518 | 0.0018 | 0.0022 |
| Cleanup on Dep Change (x1000) | 16,524 | 0.0605 | 0.0734 |
| Dispose | 707,677 | 0.0014 | 0.0019 |
| Dispose (with Cleanup) | 724,704 | 0.0014 | 0.0017 |
| Dispose 10 Effects | 85,796 | 0.0117 | 0.0205 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 4,847 | 0.2063 | 0.2859 |
| Batch Update (10) (x1000) | 2,144 | 0.4665 | 0.5438 |
| Batch Update (100) | 296,041 | 0.0034 | 0.0051 |
| Without Batch (10) | 827,974 | 0.0012 | 0.0017 |
| With Batch (10) | 204,157 | 0.0049 | 0.0081 |
| Nested Batch (2 levels) (x1000) | 3,571 | 0.2801 | 0.3783 |
| Nested Batch (5 levels) (x1000) | 1,772 | 0.5644 | 0.6886 |
| Batch with Computed | 390,474 | 0.0026 | 0.0032 |
| Batch with Diamond | 389,546 | 0.0026 | 0.0031 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 1,969 | 0.5080 | 1.0384 |
| 1 to N (Fan Out 1000) | 1,720 | 0.5815 | 1.1225 |
| N to 1 (Fan In 1000) | 8,438 | 0.1185 | 0.3203 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 4,044 | 0.2473 | 0.8523 |
| Create/Dispose 1K Computeds | 3,260 | 0.3067 | 0.9383 |
| Create/Dispose 1K Effects | 300 | 3.3281 | 4.1690 |
| Rapid GC (10K Cycles) | 518 | 1.9317 | 2.5345 |
| Subscription Churn (1K) | 33,773 | 0.0296 | 0.1352 |
| Object Pooling (10K) | 16 | 64.4718 | 67.9660 |
| Weak Reference Cleanup (1K) | 3,338 | 0.2996 | 0.9471 |
| Effect Cleanup (1K) | 105 | 9.5489 | 10.6042 |
| Circular Reference Cleanup | 20,224 | 0.0494 | 0.0609 |
| Large State Tree (10K) | 730 | 1.3698 | 2.2220 |
| Memory Usage Monitoring | 160 | 6.2634 | 7.1026 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,516 | 0.2215 | 0.4221 |
| [Atom] Initialize | 4,617 | 0.2166 | 0.4424 |
| [Vanilla] Sort (Name) | 4,361 | 0.2293 | 0.2975 |
| [Atom] Sort (Name) | 1,936 | 0.5166 | 0.6510 |
| [Vanilla] Filter (Department) | 463,993 | 0.0022 | 0.0029 |
| [Atom] Filter (Department) | 24,233 | 0.0413 | 0.0507 |
| [Vanilla] Sort + Filter + Paginate | 4,219 | 0.2370 | 0.2776 |
| [Atom] Sort + Filter + Paginate | 1,902 | 0.5256 | 0.5973 |
| Select/Deselect Rows | 1,894 | 0.5279 | 0.7563 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 21,558 | 0.0464 | 0.0751 |
| Wide Fan-out (1→100) | 18,417 | 0.0543 | 0.0711 |
| Diamond Pattern | 78,610 | 0.0127 | 0.0221 |
| Pyramid (50 levels) | 31,300 | 0.0319 | 0.0608 |
| Mixed (100A, 200C) | 123,353 | 0.0081 | 0.0154 |
| Circular Avoidance | 396,134 | 0.0025 | 0.0031 |
| Conditional Deps | 673,535 | 0.0015 | 0.0018 |
| Array Dynamic Deps | 683,970 | 0.0015 | 0.0019 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 828,310 | 0.0012 | 0.0022 |
| Toggle Completion | 9,209 | 0.1086 | 0.1547 |
| Filter (Active/Completed) | 711,275 | 0.0014 | 0.0022 |
| Delete (50 from 100) | 42,353 | 0.0236 | 0.0491 |
| Complete Workflow | 178,476 | 0.0056 | 0.0119 |
| Stats with Auto-update | 561,992 | 0.0018 | 0.0036 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 77,926 | 0.0128 | 0.0220 |
| Updates per frame (100 atoms, batched) | 32,641 | 0.0306 | 0.0427 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 7,868 | 0.1271 | 0.8804 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 158,572 | 0.0063 | 0.0123 |
| Form reset (no batch) | 567,969 | 0.0018 | 0.0026 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 1,020,997 | 0.0010 | 0.0016 |
