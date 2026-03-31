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
| Create 1000 Atoms (Primitives) | 64,527.26 | 0.0155 | 0.0852 |
| Create 1000 Atoms (Objects) | 59,205.82 | 0.0169 | 0.0322 |
| Read 1000 Atoms (Value) | 799,052.49 | 0.0013 | 0.0013 |
| Read 1000 Atoms (Peek) | 808,403.80 | 0.0012 | 0.0013 |
| Write 1000 Atoms | 333,588.04 | 0.0030 | 0.0031 |
| Subscribe/Unsubscribe (x100) | 366,912.09 | 0.0027 | 0.0033 |
| Notify 1 Subscriber (x1000) | 276,309.34 | 0.0036 | 0.0042 |
| Untracked Read (x1000) | 765,625.78 | 0.0013 | 0.0014 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 20,057.13 | 0.0499 | 0.1214 |
| Create (3 Deps) (x1000) | 10,680.60 | 0.0936 | 0.1656 |
| Create Chain (100) | 83,057.08 | 0.0120 | 0.0238 |
| Read (Single Dep) (x1000) | 604,603.31 | 0.0017 | 0.0029 |
| Read (Multiple) (x1000) | 605,404.64 | 0.0017 | 0.0026 |
| Nested Computation (x1000) | 610,928.61 | 0.0016 | 0.0016 |
| Recompute (Single Dep) (x1000) | 94,703.38 | 0.0106 | 0.0187 |
| Recompute (Chain of 10) | 77,791.54 | 0.0129 | 0.0235 |
| No Recompute (Unchanged) (x1000) | 197,123.50 | 0.0051 | 0.0058 |
| Lazy (Not Accessed) (x1000) | 20,165.78 | 0.0496 | 0.1557 |
| Lazy (Accessed Once) (x1000) | 7,904.38 | 0.1265 | 0.2632 |
| Lazy (Multiple Access) (x1000) | 8,027.58 | 0.1246 | 0.2639 |
| Cache Invalidation (x1000) | 151,901.44 | 0.0066 | 0.0136 |
| Diamond Invalidation (x1000) | 150,944.96 | 0.0066 | 0.0077 |
| Dispose (x1000) | 18,099.77 | 0.0552 | 0.1500 |
| Dispose Chain | 629.04 | 1.5897 | 1.7452 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 4,863.57 | 0.2056 | 0.3415 |
| Create (Multiple Deps) (x1000) | 2,820.93 | 0.3545 | 0.4794 |
| Create 10 Effects | 289,225.14 | 0.0035 | 0.0056 |
| Execution (Dep Change) (x1000) | 334,162.42 | 0.0030 | 0.0033 |
| Execution (Multiple) (x1000) | 83,000.85 | 0.0120 | 0.0201 |
| With Computed Dep (x1000) | 332,281.75 | 0.0030 | 0.0035 |
| Re-runs (10 times) (x1000) | 16,508.81 | 0.0606 | 0.0756 |
| Multiple on Same Dep (x1000) | 162,844.47 | 0.0061 | 0.0070 |
| With Cleanup (Creation) (x1000) | 3,758.37 | 0.2661 | 0.5115 |
| Cleanup on Dep Change (x1000) | 163,343.76 | 0.0061 | 0.0072 |
| Dispose (x1000) | 4,506.45 | 0.2219 | 0.3594 |
| Dispose (with Cleanup) (x1000) | 4,074.56 | 0.2454 | 0.3792 |
| Dispose 10 Effects | 277,259.22 | 0.0036 | 0.0049 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 34,536.65 | 0.0290 | 0.0954 |
| Batch Update (10) (x1000) | 14,503.49 | 0.0689 | 0.1371 |
| Batch Update (100) (x1000) | 1,964.59 | 0.5090 | 0.6229 |
| Without Batch (10) (x1000) | 26,108.44 | 0.0383 | 0.0480 |
| With Batch (10) (x1000) | 1,141.01 | 0.8764 | 1.0256 |
| Nested Batch (2 levels) (x1000) | 16,324.09 | 0.0613 | 0.1191 |
| Nested Batch (5 levels) (x1000) | 6,443.86 | 0.1552 | 0.2564 |
| Batch with Computed (x1000) | 2,366.18 | 0.4226 | 0.5478 |
| Batch with Diamond (x1000) | 2,522.25 | 0.3965 | 0.5859 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 11,814.21 | 0.0846 | 0.1283 |
| 1 to N (Fan Out 1000) | 24,457.87 | 0.0409 | 0.0514 |
| N to 1 (Fan In 1000) | 57,946.79 | 0.0173 | 0.0266 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (x1000) | 76,739.58 | 0.0130 | 0.0417 |
| Array: Push 4 items (baseline) (x1000) | 79,493.09 | 0.0126 | 0.1043 |
| SlotBuffer: Add 16 items (spill) (x1000) | 14,469.66 | 0.0691 | 0.1680 |
| Array: Push 16 items (baseline) (x1000) | 35,842.81 | 0.0279 | 0.1232 |
| SlotBuffer: Churn (8 rem + 8 add) (x1000) | 3,589.53 | 0.2786 | 0.3906 |
| SlotBuffer: Iteration (4 items) (x1000) | 91,197.50 | 0.0110 | 0.0231 |
| SlotBuffer: Iteration (16 items) (x1000) | 29,343.67 | 0.0341 | 0.0530 |
| SlotBuffer: Compaction (16 items) (x1000) | 3,923.16 | 0.2549 | 0.3619 |
| DepSlotBuffer: Seal + isDirty (4 items) (x1000) | 30,512.32 | 0.0328 | 0.0411 |
| DepSlotBuffer: Seal + isDirty (16 items) (x1000) | 15,871.87 | 0.0630 | 0.0723 |
| DepSlotBuffer: Claim existing (Inline hit) (x1000) | 22,115.60 | 0.0452 | 0.0544 |
| DepSlotBuffer: Claim existing (Overflow) (x1000) | 2,186.06 | 0.4574 | 0.4853 |
| DepSlotBuffer: Map fallback (64 items) (x1000) | 1,240.79 | 0.8059 | 0.8378 |
| DepSlotBuffer: Truncation (16 items) (x1000) | 2,302.68 | 0.4343 | 0.7512 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 15,194.92 | 0.0658 | 0.1931 |
| Create/Dispose 1K Computeds | 11,035.65 | 0.0906 | 0.3341 |
| Create/Dispose 1K Effects | 431.23 | 2.3190 | 2.6303 |
| Rapid GC (10K Cycles) | 5,523.42 | 0.1810 | 0.2862 |
| Subscription Churn (1K) | 42,182.59 | 0.0237 | 0.1208 |
| Object Pooling (10K Objects) | 21.6469 | 46.1960 | 48.8062 |
| Weak Reference Cleanup (1K) | 11,182.29 | 0.0894 | 0.3269 |
| Effect Cleanup (1K) | 141.06 | 7.0893 | 7.4758 |
| Circular Reference Cleanup | 157,208.11 | 0.0064 | 0.0112 |
| Large State Tree (10K) | 767.54 | 1.3029 | 4.7966 |
| Memory Usage Monitoring | 205.27 | 4.8715 | 7.6685 |

### Data Grid (1000 Rows) - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,402.88 | 0.2271 | 0.4013 |
| [Atom] Initialize | 4,398.57 | 0.2273 | 0.4418 |
| [Vanilla] Sort (Name) | 4,508.99 | 0.2218 | 0.2509 |
| [Atom] Sort (Name) | 4,221.74 | 0.2369 | 0.2836 |
| [Vanilla] Filter (Department) | 484,347.42 | 0.0021 | 0.0026 |
| [Atom] Filter (Department) | 209,176.26 | 0.0048 | 0.0060 |
| [Vanilla] Sort + Filter + Paginate | 4,323.25 | 0.2313 | 0.2776 |
| [Atom] Sort + Filter + Paginate | 4,129.62 | 0.2422 | 0.2783 |
| Select/Deselect Rows | 2,594.50 | 0.3854 | 0.6680 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 172,897.09 | 0.0058 | 0.0082 |
| Wide Fan-out (1→100) | 238,298.93 | 0.0042 | 0.0048 |
| Diamond Pattern | 738,833.12 | 0.0014 | 0.0016 |
| Pyramid (50 levels) | 223,308.62 | 0.0045 | 0.0052 |
| Mixed (100A, 200C) | 634,496.78 | 0.0016 | 0.0018 |
| Circular Avoidance | 126,087.29 | 0.0079 | 0.0140 |
| Conditional Deps (x1000) | 37,439.99 | 0.0267 | 0.0351 |
| Array Dynamic Deps (x1000) | 33,370.37 | 0.0300 | 0.0385 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 62,843.81 | 0.0159 | 0.0326 |
| Toggle Completion | 655,898.94 | 0.0015 | 0.0020 |
| Filter Switch (x1000) | 31,367.96 | 0.0319 | 0.0404 |
| Delete Todos (50 items) | 126,357.33 | 0.0079 | 0.0188 |
| Full Workflow | 405,550.82 | 0.0025 | 0.0030 |
| Stat Propagation (100 items) | 105,386.65 | 0.0095 | 0.0196 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| updates per frame (100 atoms) | 461,727.55 | 0.0022 | 0.0038 |
| updates per frame (100 atoms, batched) | 162,079.79 | 0.0062 | 0.0108 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Heavy component churn (1000 items) | 1,731.82 | 0.5774 | 1.1068 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 600.23 | 1.6660 | 2.8990 |
| Form reset (no batch) | 7,650.52 | 0.1307 | 0.2715 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency (pure propagation) | 122.92 | 8.1351 | 9.9985 |
