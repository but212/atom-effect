# Benchmark Results - Detailed

**Last Updated**: 2026-04-07
**Version**: v0.29.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Atoms (Primitives) | 315,140.72 | 0.0032 | 0.0058 |
| Create 100 Atoms (Objects) | 305,641.28 | 0.0033 | 0.0048 |
| Read/Write Performance (x100) | 1,555,838.36 | 0.0006 | 0.0012 |
| Untracked Read (x100) | 3,033,944.53 | 0.0003 | 0.0006 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Recompute & Cache (x100) | 240,217.35 | 0.0042 | 0.0046 |
| Lazy Evaluation Overhead (x100) | 79,582.08 | 0.0126 | 0.0244 |
| Creation: Flat vs Chain (10 levels) | 712,712.76 | 0.0014 | 0.0024 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Creation & Disposal (x100) | 59,787.08 | 0.0167 | 0.0287 |
| Propagation: Atom → Computed → Effect (x100) | 1,605,799.00 | 0.0006 | 0.0009 |
| Cleanup Execution (x100) | 713,070.57 | 0.0014 | 0.0018 |

### Lenses - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read: Lens (x100) | 211,870.78 | 0.0047 | 0.0047 |
| Read: Computed Active (x100) | 637,315.86 | 0.0016 | 0.0028 |
| Read: Direct Object Access (x100) | 750,708.45 | 0.0013 | 0.0013 |
| Write: Lens (x100) | 24,550.43 | 0.0407 | 0.0511 |
| Write: Manual Spread (x100) | 300,892.51 | 0.0033 | 0.0050 |
| Composition & Scaling (100 active) | 5,912.57 | 0.1691 | 3.8410 |

### Batch & Synchronization - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update 100 Atoms (x100) | 20,103.79 | 0.0497 | 0.0616 |
| Batched Computed Chain Update (x100) | 28,477.68 | 0.0351 | 0.0538 |

### Propagation - Stress Tests (1000 nodes)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 Propagation (Depth 1000) | 16,914.77 | 0.0591 | 0.0762 |
| 1 to N Propagation (Fan Out 1000) | 16,632.10 | 0.0601 | 0.0703 |
| N to 1 Propagation (Fan In 1000) | 73,615.20 | 0.0136 | 0.0230 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (SlotBuffer) X100 | 543,840.18 | 0.0018 | 0.0025 |
| SlotBuffer: Push 4 items (Array baseline) X100 | 690,042.92 | 0.0014 | 0.0020 |
| SlotBuffer: Add 16 items (SlotBuffer spill) X100 | 141,778.32 | 0.0071 | 0.0138 |
| SlotBuffer: Push 16 items (Array baseline) X100 | 341,971.98 | 0.0029 | 0.0038 |
| SlotBuffer: Remove 8 and Add 8 (Reuse) X100 | 37,119.06 | 0.0269 | 0.0387 |
| SlotBuffer: forEach 16 items (SlotBuffer) X100 | 283,968.35 | 0.0035 | 0.0043 |
| SlotBuffer: Compact 16 items with 8 gaps X100 | 38,749.24 | 0.0258 | 0.0395 |
| DepSlotBuffer: ClaimExisting (Inline hit) | 218,335.40 | 0.0046 | 0.0053 |
| DepSlotBuffer: ClaimExisting (Map fallback 64) | 12,371.19 | 0.0808 | 0.0919 |
| DepSlotBuffer: truncateFrom(0) (16 items) | 23,719.56 | 0.0422 | 0.1410 |

## 2. Macro-Benchmarks

### Memory & GC Pressure - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Units (A/C/E) | 2,634.88 | 0.3795 | 0.7674 |
| Subscription Churn (1K cycles) | 40,104.02 | 0.0249 | 0.1275 |
| Circular Reference Cleanup (100 cycles) | 187,256.66 | 0.0053 | 0.0090 |
| 10K Entity State Tree Management | 1,654.92 | 0.6043 | 0.9921 |
| Heap Monitoring (1000 large atoms) | 3,429.05 | 0.2916 | 0.5307 |

### Data Grid (1000 Rows) - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Toggle Sort | 4,512.30 | 0.2216 | 0.2464 |
| [Atom] Toggle Sort | 4,189.08 | 0.2387 | 0.3991 |
| [Vanilla] Switch Filter | 475,049.34 | 0.0021 | 0.0028 |
| [Atom] Switch Filter | 212,699.78 | 0.0047 | 0.0058 |
| [Vanilla] Sort + Filter + Paginate | 4,424.68 | 0.2260 | 0.2622 |
| [Atom] Sort + Filter + Paginate | 4,130.48 | 0.2421 | 0.2886 |
| [Manual] Update Single Cell (x100) | 19,338.81 | 0.0517 | 0.1936 |
| [Lens] Update Single Cell (x100) | 12,526.66 | 0.0798 | 0.2237 |
| Select/Deselect Rows (Set-based) | 16,619.74 | 0.0602 | 0.1929 |

### Dependency Graph Patterns - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 134,622.09 | 0.0074 | 0.0112 |
| Diamond Pattern (1 → 10 → 10 → 1) | 659,325.70 | 0.0015 | 0.0019 |
| Pyramid Pattern (50 levels) | 224,844.69 | 0.0044 | 0.0052 |
| Mixed Dependencies (100A → 200C) | 592,931.29 | 0.0017 | 0.0020 |
| Circular Avoidance (x100) | 792,443.23 | 0.0013 | 0.0014 |
| Conditional Dependencies (x100) | 187,240.65 | 0.0053 | 0.0060 |
| Array-based Selection (x100) | 194,673.38 | 0.0051 | 0.0056 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Full Workflow | 95,605.91 | 0.0105 | 0.0211 |
| [Atom] Full Workflow | 96,354.96 | 0.0104 | 0.0212 |

### Large Grid with Lenses (50x50)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update: 10 Random Cells | 259,872.20 | 0.0038 | 0.0062 |
| Bulk Update: Replace Grid | 62,969.24 | 0.0159 | 0.3337 |
| Read Performance: 2500 Lenses | 6,498.64 | 0.1539 | 0.1741 |

### Recursive Lens Depth Stress

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read Depth 100 Lens Chain (x100) | 2,679.40 | 0.3732 | 0.3933 |
| Update Depth 100 Lens Chain | 6,248.56 | 0.1600 | 0.1804 |

## 3. Realistic-Benchmarks

### Frame Budget & Sync

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Manual] State Sync (100 atoms) | 503,558.89 | 0.0020 | 0.0030 |
| [Batch] State Sync (100 atoms) | 161,908.89 | 0.0062 | 0.0081 |

### Stability & Memory

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Heavy Component Lifecycle (x100) | 17,970.97 | 0.0556 | 0.2734 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Batch] Form Reset (20 fields, x100) | 6,103.60 | 0.1638 | 0.3332 |
| [Manual] Form Reset (20 fields, x100) | 72,153.35 | 0.0139 | 0.0223 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input-to-Render Latency (simulation) | 148.00 | 6.7569 | 7.7330 |
