# Benchmark Results - Detailed

**Last Updated**: 2026-04-14
**Version**: v0.30.1
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Atoms (Primitives) | 307,041.17 | 0.0033 | 0.0061 |
| Create 100 Atoms (Objects) | 295,036.59 | 0.0034 | 0.0058 |
| Read/Write Performance (x100) | 990,872.86 | 0.0010 | 0.0011 |
| Untracked Read (x100) | 1,556,358.63 | 0.0006 | 0.0010 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Recompute & Cache (x100) | 225,039.12 | 0.0044 | 0.0051 |
| Lazy Evaluation Overhead (x100) | 74,990.80 | 0.0133 | 0.0255 |
| Creation: Flat vs Chain (10 levels) | 716,107.91 | 0.0014 | 0.0019 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Creation & Disposal (x100) | 68,784.92 | 0.0145 | 0.0270 |
| Propagation: Atom → Computed → Effect (x100) | 1,081,084.71 | 0.0009 | 0.0010 |
| Cleanup Execution (x100) | 729,363.89 | 0.0014 | 0.0017 |

### Lenses - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read: Lens (x100) | 111,853.96 | 0.0089 | 0.0169 |
| Read: Computed Active (x100) | 617,051.07 | 0.0016 | 0.0016 |
| Read: Direct Object Access (x100) | 710,845.87 | 0.0014 | 0.0014 |
| Write: Lens (x100) | 21,793.77 | 0.0459 | 0.0570 |
| Write: Manual Spread (x100) | 302,296.82 | 0.0033 | 0.0050 |
| Composition & Scaling (100 active) | 6,302.75 | 0.1587 | 3.8845 |

### Batch & Synchronization - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update 100 Atoms (x100) | 20,180.09 | 0.0496 | 0.0607 |
| Batched Computed Chain Update (x100) | 35,082.55 | 0.0285 | 0.0411 |

### Propagation - Stress Tests (1000 nodes)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 Propagation (Depth 1000) | 15,108.83 | 0.0662 | 0.2250 |
| 1 to N Propagation (Fan Out 1000) | 16,644.42 | 0.0601 | 0.0771 |
| N to 1 Propagation (Fan In 1000) | 67,343.99 | 0.0148 | 0.0239 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (SlotBuffer) X100 | 624,514.28 | 0.0016 | 0.0026 |
| SlotBuffer: Push 4 items (Array baseline) X100 | 700,793.13 | 0.0014 | 0.0020 |
| SlotBuffer: Add 16 items (SlotBuffer spill) X100 | 136,803.66 | 0.0073 | 0.0129 |
| SlotBuffer: Push 16 items (Array baseline) X100 | 340,937.25 | 0.0029 | 0.0044 |
| SlotBuffer: Remove 8 and Add 8 (Reuse) X100 | 42,902.56 | 0.0233 | 0.0342 |
| SlotBuffer: forEach 4 items (SlotBuffer) X100 | 864,321.12 | 0.0012 | 0.0016 |
| SlotBuffer: forEach 16 items (SlotBuffer) X100 | 360,374.33 | 0.0028 | 0.0037 |
| SlotBuffer: Compact 16 items with 8 gaps X100 | 27,593.69 | 0.0362 | 0.0503 |
| DepSlotBuffer: ClaimExisting (Inline hit) | 247,275.48 | 0.0040 | 0.0040 |
| DepSlotBuffer: ClaimExisting (Map fallback 64) | 14,601.24 | 0.0685 | 0.0786 |
| DepSlotBuffer: truncateFrom(0) (16 items) | 24,232.58 | 0.0413 | 0.1441 |

## 2. Macro-Benchmarks

### Memory & GC Pressure - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Units (A/C/E) | 1,535.30 | 0.6513 | 1.1925 |
| Subscription Churn (1K cycles) | 33,544.91 | 0.0298 | 0.1501 |
| Circular Reference Cleanup (100 cycles) | 178,584.92 | 0.0056 | 0.0091 |

### Data Grid (1000 Rows) - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Toggle Sort | 4,477.25 | 0.2234 | 0.2523 |
| [Atom] Toggle Sort | 4,165.74 | 0.2401 | 0.3402 |
| [Vanilla] Switch Filter | 484,450.22 | 0.0021 | 0.0026 |
| [Atom] Switch Filter | 219,136.80 | 0.0046 | 0.0053 |
| [Vanilla] Sort + Filter + Paginate | 4,366.92 | 0.2290 | 0.2547 |
| [Atom] Sort + Filter + Paginate | 4,087.10 | 0.2447 | 0.2806 |
| [Manual] Update Single Cell (x100) | 21,342.68 | 0.0469 | 0.1790 |
| [Lens] Update Single Cell (x100) | 10,786.16 | 0.0927 | 0.2526 |
| Select/Deselect Rows (Set-based) | 16,660.00 | 0.0600 | 0.2085 |

### Dependency Graph Patterns - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 136,929.67 | 0.0073 | 0.0117 |
| Diamond Pattern (1 → 10 → 10 → 1) | 543,155.32 | 0.0018 | 0.0032 |
| Pyramid Pattern (50 levels) | 203,112.64 | 0.0049 | 0.0059 |

### Complex Graph Architecture

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mixed Dependencies (100A → 200C) | 559,087.54 | 0.0018 | 0.0022 |
| Circular Avoidance (x100) | 741,340.66 | 0.0013 | 0.0015 |

### Dynamic Dependency Patterns

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Conditional Dependencies (x100) | 173,977.33 | 0.0057 | 0.0062 |
| Array-based Selection (x100) | 180,404.16 | 0.0055 | 0.0062 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Full Workflow | 96,080.61 | 0.0104 | 0.0210 |
| [Atom] Full Workflow | 96,289.60 | 0.0104 | 0.0210 |

### Large Grid with Lenses (50x50)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update: 10 Random Cells | 233,274.09 | 0.0043 | 0.0063 |
| Bulk Update: Replace Grid | 63,497.68 | 0.0157 | 0.3384 |
| Read Performance: 2500 Lenses | 4,572.67 | 0.2187 | 0.2574 |

### Recursive Lens Depth Stress

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read Depth 100 Lens Chain (x100) | 2,217.08 | 0.4510 | 0.4793 |
| Update Depth 100 Lens Chain | 4,512.77 | 0.2216 | 0.2427 |

### Large State Analysis

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 10K Entity State Tree Management | 1,267.97 | 0.7887 | 3.9825 |
| Heap Monitoring (1000 large atoms) | 3,210.73 | 0.3115 | 0.5980 |

## 3. Realistic-Benchmarks

### Frame Budget & Sync

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Manual] State Sync (100 atoms) | 570,553.83 | 0.0018 | 0.0018 |
| [Batch] State Sync (100 atoms) | 157,515.88 | 0.0063 | 0.0101 |

### Stability & Memory

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Heavy Component Lifecycle (x100) | 17,591.32 | 0.0568 | 0.2972 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Batch] Form Reset (20 fields, x100) | 6,347.77 | 0.1575 | 0.2836 |
| [Manual] Form Reset (20 fields, x100) | 75,961.17 | 0.0132 | 0.0214 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input-to-Render Latency (simulation) | 150.57 | 6.6416 | 6.9195 |
