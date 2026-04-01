# Benchmark Results - Detailed

**Last Updated**: 2026-03-31
**Version**: v0.27.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Atoms (Primitives) | 589,908.45 | 0.0017 | 0.0028 |
| Create 100 Atoms (Objects) | 551,172.90 | 0.0018 | 0.0024 |
| Read 100 Atoms (Value) | 5,024,590.72 | 0.0002 | 0.0002 |
| Read 100 Atoms (Peek) | 5,143,511.78 | 0.0002 | 0.0002 |
| Write 100 Atoms | 2,531,384.33 | 0.0004 | 0.0004 |
| Subscribe/Unsubscribe (x100) | 342,474.22 | 0.0029 | 0.0042 |
| Notify 1 Subscriber (x1000) | 275,911.00 | 0.0036 | 0.0037 |
| Untracked Read (x100) | 4,615,070.10 | 0.0002 | 0.0002 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x100) | 192,847.23 | 0.0052 | 0.0174 |
| Create (3 Deps) (x100) | 111,241.76 | 0.0090 | 0.0211 |
| Create Chain (100) | 80,999.79 | 0.0123 | 0.0250 |
| Read (Single Dep) (x100) | 4,073,142.73 | 0.0002 | 0.0003 |
| Read (Multiple) (x100) | 4,290,813.74 | 0.0002 | 0.0003 |
| Nested Computation (x100) | 4,296,570.71 | 0.0002 | 0.0003 |
| Recompute (Single Dep) (x100) | 767,446.36 | 0.0013 | 0.0014 |
| Recompute (Chain of 10) | 508,226.87 | 0.0020 | 0.0033 |
| No Recompute (Unchanged) (x100) | 1,822,229.89 | 0.0005 | 0.0006 |
| Lazy (Not Accessed) (x100) | 187,209.48 | 0.0053 | 0.0088 |
| Lazy (Accessed Once) (x100) | 76,739.43 | 0.0130 | 0.0244 |
| Lazy (Multiple Access) (x100) | 72,642.18 | 0.0138 | 0.0258 |
| Cache Invalidation (x100) | 1,173,229.19 | 0.0009 | 0.0012 |
| Diamond Invalidation (x100) | 996,904.59 | 0.0010 | 0.0011 |
| Dispose (x100) | 160,959.10 | 0.0062 | 0.0105 |
| Dispose Chain | 6,289.82 | 0.1590 | 0.6388 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x100) | 63,494.11 | 0.0157 | 0.0293 |
| Create (Multiple Deps) (x100) | 32,686.38 | 0.0306 | 0.1595 |
| Create 10 Effects | 283,082.16 | 0.0035 | 0.0045 |
| Execution (Dep Change) (x100) | 1,207,919.89 | 0.0008 | 0.0009 |
| Execution (Multiple) (x100) | 532,972.99 | 0.0019 | 0.0019 |
| With Computed Dep (x100) | 2,063,949.63 | 0.0005 | 0.0006 |
| Re-runs (10 times) (x100) | 161,546.25 | 0.0062 | 0.0070 |
| Multiple on Same Dep (x100) | 1,229,676.73 | 0.0008 | 0.0008 |
| With Cleanup (Creation) (x100) | 36,026.60 | 0.0278 | 0.0436 |
| Cleanup on Dep Change (x100) | 1,276,216.76 | 0.0008 | 0.0009 |
| Dispose (x100) | 40,763.88 | 0.0245 | 0.0476 |
| Dispose (with Cleanup) (x100) | 41,602.76 | 0.0240 | 0.0446 |
| Dispose 10 Effects | 258,814.76 | 0.0039 | 0.0066 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x100) | 330,138.90 | 0.0030 | 0.0050 |
| Batch Update (10) (x100) | 142,406.57 | 0.0070 | 0.0121 |
| Batch Update (100) (x100) | 19,814.14 | 0.0505 | 0.0605 |
| Without Batch (10) (x100) | 289,528.97 | 0.0035 | 0.0041 |
| With Batch (10) (x100) | 10,048.38 | 0.0995 | 0.1154 |
| Nested Batch (2 levels) (x100) | 155,923.36 | 0.0064 | 0.0103 |
| Nested Batch (5 levels) (x100) | 67,174.52 | 0.0149 | 0.0262 |
| Batch with Computed (x100) | 22,398.93 | 0.0446 | 0.0573 |
| Batch with Diamond (x100) | 24,508.54 | 0.0408 | 0.0531 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 12,093.51 | 0.0827 | 0.1257 |
| 1 to N (Fan Out 1000) | 24,472.99 | 0.0409 | 0.0519 |
| N to 1 (Fan In 1000) | 58,921.49 | 0.0170 | 0.0263 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (X100) | 552,845.17 | 0.0018 | 0.0025 |
| Array: Push 4 items (baseline) (X100) | 656,183.27 | 0.0015 | 0.0022 |
| SlotBuffer: Add 16 items (spill) (X100) | 139,881.78 | 0.0071 | 0.0139 |
| Array: Push 16 items (baseline) (X100) | 336,856.74 | 0.0030 | 0.0037 |
| SlotBuffer: Churn (8 rem + 8 add) (X100) | 35,182.25 | 0.0284 | 0.0416 |
| SlotBuffer: Iteration (4 items) (X100) | 827,749.01 | 0.0012 | 0.0017 |
| SlotBuffer: Iteration (16 items) (X100) | 282,840.16 | 0.0035 | 0.0046 |
| SlotBuffer: Compaction (16 items) (X100) | 37,101.47 | 0.0270 | 0.0465 |
| DepSlotBuffer: Seal + isDirty (4 items) (X100) | 303,900.73 | 0.0033 | 0.0033 |
| DepSlotBuffer: Seal + isDirty (16 items) (X100) | 158,917.02 | 0.0063 | 0.0089 |
| DepSlotBuffer: Claim existing (Inline hit) (X100) | 218,141.21 | 0.0046 | 0.0063 |
| DepSlotBuffer: Claim existing (Overflow) (X100) | 21,881.56 | 0.0457 | 0.0551 |
| DepSlotBuffer: Map fallback (64 items) (X100) | 12,391.35 | 0.0807 | 0.0905 |
| DepSlotBuffer: Truncation (16 items) (X100) | 23,226.38 | 0.0431 | 0.1554 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 15,134.76 | 0.0661 | 0.2022 |
| Create/Dispose 1K Computeds | 10,906.99 | 0.0917 | 0.3582 |
| Create/Dispose 1K Effects | 431.85 | 2.3156 | 3.6688 |
| Rapid GC (10K Cycles) | 5,691.79 | 0.1757 | 0.2846 |
| Subscription Churn (1K) | 41,906.70 | 0.0239 | 0.1220 |
| Object Pooling (10K Objects) | 21.5355 | 46.4350 | 55.9749 |
| Weak Reference Cleanup (1K) | 11,050.09 | 0.0905 | 0.3478 |
| Effect Cleanup (1K) | 140.82 | 7.1012 | 7.5202 |
| Circular Reference Cleanup | 160,694.87 | 0.0062 | 0.0110 |
| Large State Tree (10K) | 948.83 | 1.0539 | 1.7968 |
| Memory Usage Monitoring | 207.25 | 4.8252 | 5.2821 |

### Data Grid (1000 Rows) - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,390.73 | 0.2278 | 0.4327 |
| [Atom] Initialize | 4,434.93 | 0.2255 | 0.4227 |
| [Vanilla] Sort (Name) | 4,533.70 | 0.2206 | 0.2503 |
| [Atom] Sort (Name) | 4,234.59 | 0.2362 | 0.2987 |
| [Vanilla] Filter (Department) | 485,566.38 | 0.0021 | 0.0030 |
| [Atom] Filter (Department) | 207,246.24 | 0.0048 | 0.0062 |
| [Vanilla] Sort + Filter + Paginate | 4,362.21 | 0.2292 | 0.2543 |
| [Atom] Sort + Filter + Paginate | 3,964.18 | 0.2523 | 0.3111 |
| Select/Deselect Rows | 2,539.94 | 0.3937 | 0.7815 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 190,272.93 | 0.0053 | 0.0094 |
| Wide Fan-out (1→100) | 236,703.72 | 0.0042 | 0.0051 |
| Diamond Pattern | 736,342.28 | 0.0014 | 0.0016 |
| Pyramid (50 levels) | 194,715.36 | 0.0051 | 0.0060 |
| Mixed (100A, 200C) | 632,567.54 | 0.0016 | 0.0018 |
| Circular Avoidance | 839,780.37 | 0.0012 | 0.0013 |
| Conditional Deps (x100) | 339,679.31 | 0.0029 | 0.0030 |
| Array Dynamic Deps (x100) | 307,769.17 | 0.0032 | 0.0034 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 61,714.33 | 0.0162 | 0.0372 |
| Toggle Completion | 643,879.76 | 0.0016 | 0.0023 |
| Filter Switch (x100) | 263,108.66 | 0.0038 | 0.0045 |
| Delete Todos (50 items) | 118,686.00 | 0.0084 | 0.0259 |
| Full Workflow | 381,524.19 | 0.0026 | 0.0033 |
| Stat Propagation (100 items) | 102,831.13 | 0.0097 | 0.0204 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| updates per frame (100 atoms) | 435,992.30 | 0.0023 | 0.0040 |
| updates per frame (100 atoms, batched) | 158,954.61 | 0.0063 | 0.0109 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Heavy component churn (100 items) | 20,563.21 | 0.0486 | 0.3118 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 5,835.60 | 0.1714 | 0.3866 |
| Form reset (no batch) | 73,832.42 | 0.0135 | 0.0269 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency (pure propagation) | 124.51 | 8.0316 | 9.2481 |
