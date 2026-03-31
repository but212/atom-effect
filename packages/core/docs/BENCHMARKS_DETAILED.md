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
| Create 1000 Atoms (Primitives) | 64,530.77 | 0.0155 | 0.0840 |
| Create 1000 Atoms (Objects) | 58,918.36 | 0.0170 | 0.0348 |
| Read 1000 Atoms (Value) | 792,254.54 | 0.0013 | 0.0013 |
| Read 1000 Atoms (Peek) | 787,521.08 | 0.0013 | 0.0013 |
| Write 1000 Atoms | 333,350.91 | 0.0030 | 0.0032 |
| Subscribe/Unsubscribe (x100) | 370,973.96 | 0.0027 | 0.0037 |
| Notify 1 Subscriber (x1000) | 276,432.31 | 0.0036 | 0.0036 |
| Untracked Read (x1000) | 761,462.34 | 0.0013 | 0.0014 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 20,050.90 | 0.0499 | 0.1241 |
| Create (3 Deps) (x1000) | 10,949.77 | 0.0913 | 0.1657 |
| Create Chain (100) | 81,528.19 | 0.0123 | 0.0239 |
| Read (Single Dep) (x1000) | 610,053.08 | 0.0016 | 0.0016 |
| Read (Multiple) (x1000) | 601,139.50 | 0.0017 | 0.0031 |
| Nested Computation (x1000) | 611,232.45 | 0.0016 | 0.0016 |
| Recompute (Single Dep) (x1000) | 94,442.59 | 0.0106 | 0.0192 |
| Recompute (Chain of 10) | 1,288,222.61 | 0.0008 | 0.0011 |
| No Recompute (Unchanged) (x1000) | 209,543.40 | 0.0048 | 0.0048 |
| Lazy (Not Accessed) (x1000) | 20,059.58 | 0.0499 | 0.1559 |
| Lazy (Accessed Once) (x1000) | 8,679.47 | 0.1152 | 0.2406 |
| Lazy (Multiple Access) (x1000) | 8,054.99 | 0.1241 | 0.2601 |
| Cache Invalidation (x1000) | 160,358.81 | 0.0062 | 0.0129 |
| Diamond Invalidation (x1000) | 158,645.63 | 0.0063 | 0.0070 |
| Dispose (x1000) | 18,163.51 | 0.0551 | 0.1728 |
| Dispose Chain | 1,672,808.38 | 0.0006 | 0.0009 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 5,499.71 | 0.1818 | 0.3096 |
| Create (Multiple Deps) (x1000) | 3,267.99 | 0.3060 | 0.4294 |
| Create 10 Effects | 336,662.84 | 0.0030 | 0.0037 |
| Execution (Dep Change) (x1000) | 332,584.18 | 0.0030 | 0.0034 |
| Execution (Multiple) (x1000) | 82,342.07 | 0.0121 | 0.0215 |
| With Computed Dep (x1000) | 331,115.40 | 0.0030 | 0.0034 |
| Re-runs (10 times) (x1000) | 16,522.20 | 0.0605 | 0.0702 |
| Multiple on Same Dep (x1000) | 163,171.01 | 0.0061 | 0.0068 |
| With Cleanup (Creation) (x1000) | 4,588.92 | 0.2179 | 0.5032 |
| Cleanup on Dep Change (x1000) | 163,259.42 | 0.0061 | 0.0082 |
| Dispose (x1000) | 5,479.12 | 0.1825 | 0.3148 |
| Dispose (with Cleanup) (x1000) | 5,194.61 | 0.1925 | 0.3241 |
| Dispose 10 Effects | 310,673.89 | 0.0032 | 0.0051 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 34,972.81 | 0.0286 | 0.0973 |
| Batch Update (10) (x1000) | 14,601.78 | 0.0685 | 0.1387 |
| Batch Update (100) (x1000) | 1,991.55 | 0.5021 | 0.5890 |
| Without Batch (10) (x1000) | 30,900.46 | 0.0324 | 0.0408 |
| With Batch (10) (x1000) | 1,021.44 | 0.9790 | 1.1297 |
| Nested Batch (2 levels) (x1000) | 17,857.61 | 0.0560 | 0.1032 |
| Nested Batch (5 levels) (x1000) | 6,530.11 | 0.1531 | 0.2556 |
| Batch with Computed (x1000) | 2,328.87 | 0.4294 | 0.5575 |
| Batch with Diamond (x1000) | 2,494.81 | 0.4008 | 0.5347 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 11,452.78 | 0.0873 | 0.1376 |
| 1 to N (Fan Out 1000) | 24,755.92 | 0.0404 | 0.0513 |
| N to 1 (Fan In 1000) | 58,951.03 | 0.0170 | 0.0266 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (x1000) | 90,349.89 | 0.0111 | 0.0196 |
| Array: Push 4 items (baseline) (x1000) | 79,191.04 | 0.0126 | 0.1026 |
| SlotBuffer: Add 16 items (spill) (x1000) | 15,780.76 | 0.0634 | 0.1567 |
| Array: Push 16 items (baseline) (x1000) | 36,849.91 | 0.0271 | 0.1203 |
| SlotBuffer: Churn (8 rem + 8 add) (x1000) | 3,499.56 | 0.2858 | 0.4052 |
| SlotBuffer: Iteration (4 items) (x1000) | 91,290.15 | 0.0110 | 0.0229 |
| SlotBuffer: Iteration (16 items) (x1000) | 29,420.15 | 0.0340 | 0.0470 |
| SlotBuffer: Compaction (16 items) (x1000) | 3,848.53 | 0.2598 | 0.4775 |
| DepSlotBuffer: Seal + isDirty (4 items) (x1000) | 31,730.06 | 0.0315 | 0.0400 |
| DepSlotBuffer: Seal + isDirty (16 items) (x1000) | 16,333.41 | 0.0612 | 0.0699 |
| DepSlotBuffer: Claim existing (Inline hit) (x1000) | 22,017.62 | 0.0454 | 0.0564 |
| DepSlotBuffer: Claim existing (Overflow) (x1000) | 2,186.82 | 0.4573 | 0.4923 |
| DepSlotBuffer: Map fallback (64 items) (x1000) | 1,236.27 | 0.8089 | 0.8765 |
| DepSlotBuffer: Truncation (16 items) (x1000) | 2,356.62 | 0.4243 | 0.5052 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 15,560.59 | 0.0643 | 0.1849 |
| Create/Dispose 1K Computeds | 11,465.00 | 0.0872 | 0.3256 |
| Create/Dispose 1K Effects | 425.39 | 2.3508 | 3.7677 |
| Rapid GC (10K Cycles) | 5,799.69 | 0.1724 | 0.2731 |
| Subscription Churn (1K) | 42,517.60 | 0.0235 | 0.1191 |
| Object Pooling (10K Objects) | 21.71 | 46.0569 | 48.6730 |
| Weak Reference Cleanup (1K) | 11,259.29 | 0.0888 | 0.3382 |
| Effect Cleanup (1K) | 141.27 | 7.0787 | 7.4702 |
| Circular Reference Cleanup | 164,756.98 | 0.0061 | 0.0106 |
| Large State Tree (10K) | 971.90 | 1.0289 | 1.7323 |
| Memory Usage Monitoring | 208.10 | 4.8053 | 5.1818 |

### Data Grid (1000 Rows) - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,401.09 | 0.2272 | 0.4130 |
| [Atom] Initialize | 4,434.69 | 0.2255 | 0.4287 |
| [Vanilla] Sort (Name) | 4,498.44 | 0.2223 | 0.2495 |
| [Atom] Sort (Name) | 4,217.91 | 0.2371 | 0.2948 |
| [Vanilla] Filter (Department) | 462,419.13 | 0.0022 | 0.0027 |
| [Atom] Filter (Department) | 205,653.29 | 0.0049 | 0.0071 |
| [Vanilla] Sort + Filter + Paginate | 4,349.25 | 0.2299 | 0.2666 |
| [Atom] Sort + Filter + Paginate | 4,071.87 | 0.2456 | 0.2796 |
| Select/Deselect Rows | 2,527.70 | 0.3956 | 0.7011 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 172,170.17 | 0.0058 | 0.0081 |
| Wide Fan-out (1→100) | 238,688.85 | 0.0042 | 0.0046 |
| Diamond Pattern | 640,045.69 | 0.0016 | 0.0018 |
| Pyramid (50 levels) | 204,666.44 | 0.0049 | 0.0054 |
| Mixed (100A, 200C) | 639,976.10 | 0.0016 | 0.0018 |
| Circular Avoidance | 2,179,558.90 | 0.0005 | 0.0006 |
| Conditional Deps (x1000) | 31,889.07 | 0.0314 | 0.0396 |
| Array Dynamic Deps (x1000) | 34,131.95 | 0.0293 | 0.0376 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 65,388.60 | 0.0153 | 0.0290 |
| Toggle Completion | 654,638.71 | 0.0015 | 0.0020 |
| Filter Switch (x1000) | 39,575.34 | 0.0253 | 0.0337 |
| Delete Todos (50 items) | 118,476.17 | 0.0084 | 0.0200 |
| Full Workflow | 389,540.49 | 0.0026 | 0.0029 |
| Stat Propagation (100 items) | 105,367.38 | 0.0095 | 0.0200 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| updates per frame (100 atoms) | 367,446.21 | 0.0027 | 0.0046 |
| updates per frame (100 atoms, batched) | 157,919.37 | 0.0063 | 0.0082 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Heavy component churn (1000 items) | 1,753.94 | 0.5701 | 1.1200 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 540,487.98 | 0.0019 | 0.0035 |
| Form reset (no batch) | 2,082,629.45 | 0.0005 | 0.0007 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency (pure propagation) | 123.28 | 8.1118 | 9.2249 |
