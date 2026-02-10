# Benchmark Results - Detailed

**Last Updated**: 2026-02-10
**Version**: v0.20.0
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 8,274 | 0.1209 | 0.7447 |
| Create 1000 Atoms (Objects) | 7,792 | 0.1283 | 0.7981 |
| Read 1000 Atoms (Value) | 40,732 | 0.0246 | 0.0289 |
| Read 1000 Atoms (Peek) | 630,507 | 0.0016 | 0.0017 |
| Write 1000 Atoms | 335,686 | 0.0030 | 0.0032 |
| Subscribe/Unsubscribe (x100) | 304,010 | 0.0033 | 0.0045 |
| Notify 1 Subscriber (x1000) | 29,682 | 0.0337 | 0.0420 |
| Untracked Read (x1000) | 39,995 | 0.0250 | 0.0396 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 3,253 | 0.3074 | 1.1695 |
| Create (3 Deps) (x1000) | 1,769 | 0.5653 | 1.3017 |
| Create Chain (100) | 15,649 | 0.0639 | 0.0850 |
| Read (Single Dep) (x1000) | 46,977 | 0.0213 | 0.0280 |
| Read (Multiple) (x1000) | 46,639 | 0.0214 | 0.0382 |
| Nested Computation (x1000) | 47,158 | 0.0212 | 0.0256 |
| Recompute (Single Dep) | 1,119,692 | 0.0009 | 0.0013 |
| Recompute (Chain of 10) | 190,095 | 0.0053 | 0.0064 |
| No Recompute (Unchanged) (x1000) | 32,889 | 0.0304 | 0.0395 |
| Lazy (Not Accessed) (x1000) | 3,307 | 0.3024 | 1.1229 |
| Lazy (Accessed Once) | 944,280 | 0.0011 | 0.0014 |
| Lazy (Multiple Access) | 983,641 | 0.0010 | 0.0016 |
| Cache Invalidation | 1,039,574 | 0.0010 | 0.0015 |
| Diamond Invalidation | 457,337 | 0.0022 | 0.0028 |
| Dispose (x1000) | 2,475 | 0.4040 | 1.3464 |
| Dispose Chain | 340,345 | 0.0029 | 0.0035 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 879,714 | 0.0011 | 0.0016 |
| Create (Multiple Deps) | 520,719 | 0.0019 | 0.0025 |
| Create 10 Effects | 103,134 | 0.0097 | 0.0160 |
| Execution (Dep Change) (x1000) | 18,589 | 0.0538 | 0.0638 |
| Execution (Multiple) (x1000) | 8,809 | 0.1135 | 0.1307 |
| With Computed Dep (x1000) | 18,704 | 0.0535 | 0.0621 |
| Re-runs (10 times) | 1,100,380 | 0.0009 | 0.0014 |
| Multiple on Same Dep (x1000) | 18,634 | 0.0537 | 0.0624 |
| With Cleanup | 641,268 | 0.0016 | 0.0021 |
| Cleanup on Dep Change (x1000) | 18,683 | 0.0535 | 0.0651 |
| Dispose | 852,428 | 0.0012 | 0.0016 |
| Dispose (with Cleanup) | 785,785 | 0.0013 | 0.0016 |
| Dispose 10 Effects | 98,693 | 0.0101 | 0.0164 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,469 | 0.1828 | 0.2503 |
| Batch Update (10) (x1000) | 2,273 | 0.4400 | 0.5121 |
| Batch Update (100) | 309,149 | 0.0032 | 0.0043 |
| Without Batch (10) | 796,789 | 0.0013 | 0.0018 |
| With Batch (10) | 205,216 | 0.0049 | 0.0068 |
| Nested Batch (2 levels) (x1000) | 3,898 | 0.2566 | 0.3695 |
| Nested Batch (5 levels) (x1000) | 1,842 | 0.5429 | 0.6746 |
| Batch with Computed | 371,173 | 0.0027 | 0.0035 |
| Batch with Diamond | 394,788 | 0.0025 | 0.0033 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 2,066 | 0.4841 | 0.9742 |
| 1 to N (Fan Out 1000) | 1,874 | 0.5337 | 1.0557 |
| N to 1 (Fan In 1000) | 9,067 | 0.1103 | 0.3497 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 4,023 | 0.2486 | 1.0015 |
| Create/Dispose 1K Computeds | 3,240 | 0.3086 | 1.1430 |
| Create/Dispose 1K Effects | 356 | 2.8117 | 4.0863 |
| Rapid GC (10K Cycles) | 523 | 1.9114 | 2.7058 |
| Subscription Churn (1K) | 31,742 | 0.0315 | 0.1379 |
| Object Pooling (10K) | 21 | 46.9356 | 47.6533 |
| Weak Reference Cleanup (1K) | 3,236 | 0.3090 | 1.1259 |
| Effect Cleanup (1K) | 123 | 8.0990 | 9.2830 |
| Circular Reference Cleanup | 21,034 | 0.0475 | 0.0592 |
| Large State Tree (10K) | 906 | 1.1038 | 1.8980 |
| Memory Usage Monitoring | 196 | 5.1051 | 6.3187 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,664 | 0.2144 | 0.4352 |
| [Atom] Initialize | 4,645 | 0.2153 | 0.4534 |
| [Vanilla] Sort (Name) | 4,319 | 0.2315 | 0.2609 |
| [Atom] Sort (Name) | 1,951 | 0.5127 | 0.5738 |
| [Vanilla] Filter (Department) | 500,833 | 0.0020 | 0.0026 |
| [Atom] Filter (Department) | 25,282 | 0.0396 | 0.0444 |
| [Vanilla] Sort + Filter + Paginate | 4,249 | 0.2354 | 0.2629 |
| [Atom] Sort + Filter + Paginate | 1,905 | 0.5251 | 0.5658 |
| Select/Deselect Rows | 2,031 | 0.4923 | 0.6617 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 21,989 | 0.0455 | 0.0721 |
| Wide Fan-out (1→100) | 19,391 | 0.0516 | 0.0675 |
| Diamond Pattern | 78,865 | 0.0127 | 0.0199 |
| Pyramid (50 levels) | 32,187 | 0.0311 | 0.0402 |
| Mixed (100A, 200C) | 123,484 | 0.0081 | 0.0118 |
| Circular Avoidance | 399,515 | 0.0025 | 0.0033 |
| Conditional Deps | 667,386 | 0.0015 | 0.0020 |
| Array Dynamic Deps | 685,487 | 0.0015 | 0.0020 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 921,941 | 0.0011 | 0.0021 |
| Toggle Completion | 9,575 | 0.1044 | 0.1300 |
| Filter (Active/Completed) | 806,462 | 0.0012 | 0.0019 |
| Delete (50 from 100) | 43,216 | 0.0231 | 0.0458 |
| Complete Workflow | 191,054 | 0.0052 | 0.0106 |
| Stats with Auto-update | 565,788 | 0.0018 | 0.0030 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 86,921 | 0.0115 | 0.0186 |
| Updates per frame (100 atoms, batched) | 34,520 | 0.0290 | 0.0388 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 8,886 | 0.1125 | 0.4101 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 171,311 | 0.0058 | 0.0091 |
| Form reset (no batch) | 609,213 | 0.0016 | 0.0025 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 793,777 | 0.0013 | 0.0016 |
