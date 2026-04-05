# Benchmark Results - Detailed

**Last Updated**: 2026-04-05
**Version**: v0.27.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Atoms (Primitives) | 302,826.05 | 0.0033 | 0.0062 |
| Create 100 Atoms (Objects) | 276,283.20 | 0.0036 | 0.0053 |
| Read/Write Performance (x100) | 1,622,672.74 | 0.0006 | 0.0007 |
| Untracked Read (x100) | 2,810,420.25 | 0.0004 | 0.0006 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Recompute & Cache (x100) | 249,052.95 | 0.0040 | 0.0074 |
| Lazy Evaluation Overhead (x100) | 65,049.65 | 0.0154 | 0.0263 |
| Creation: Flat vs Chain (10 levels) | 529,016.88 | 0.0019 | 0.0028 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Creation & Disposal (x100) | 57,480.48 | 0.0174 | 0.0281 |
| Propagation: Atom → Computed → Effect (x100) | 1,472,049.92 | 0.0007 | 0.0010 |
| Cleanup Execution (x100) | 655,734.40 | 0.0015 | 0.0020 |

### Lenses - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read: Lens (x100) | 231,677.31 | 0.0043 | 0.0047 |
| Read: Computed Active (x100) | 746,265.84 | 0.0013 | 0.0027 |
| Read: Direct Object Access (x100) | 838,547.99 | 0.0012 | 0.0013 |
| Write: Lens (x100) | 23,901.45 | 0.0418 | 0.0481 |
| Write: Manual Spread (x100) | 310,920.40 | 0.0032 | 0.0041 |
| Composition & Scaling (100 active) | 5,188.31 | 0.1927 | 4.3877 |

### Batch & Synchronization - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update 100 Atoms (x100) | 22,385.49 | 0.0447 | 0.0524 |
| Batched Computed Chain Update (x100) | 23,222.69 | 0.0431 | 0.0513 |

### Propagation - Stress Tests (1000 nodes)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 Propagation (Depth 1000) | 19,491.59 | 0.0513 | 0.0582 |
| 1 to N Propagation (Fan Out 1000) | 21,024.82 | 0.0476 | 0.0535 |
| N to 1 Propagation (Fan In 1000) | 57,519.92 | 0.0174 | 0.0225 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (SlotBuffer) X100 | 554,779.65 | 0.0018 | 0.0029 |
| SlotBuffer: Push 4 items (Array baseline) X100 | 434,702.79 | 0.0023 | 0.0036 |
| SlotBuffer: Add 16 items (SlotBuffer spill) X100 | 130,533.97 | 0.0077 | 0.0126 |
| SlotBuffer: Push 16 items (Array baseline) X100 | 211,104.89 | 0.0047 | 0.0063 |
| SlotBuffer: Remove 8 and Add 8 (Reuse) X100 | 37,761.29 | 0.0265 | 0.0377 |
| SlotBuffer: forEach 16 items (SlotBuffer) X100 | 233,149.98 | 0.0043 | 0.0057 |
| SlotBuffer: Compact 16 items with 8 gaps X100 | 41,125.28 | 0.0243 | 0.0341 |
| DepSlotBuffer: Seal() + isDirtyFast() (16 items) | 165,898.82 | 0.0060 | 0.0064 |
| DepSlotBuffer: ClaimExisting (Inline hit) | 231,368.63 | 0.0043 | 0.0047 |
| DepSlotBuffer: ClaimExisting (Map fallback 64) | 14,553.84 | 0.0687 | 0.0754 |
| DepSlotBuffer: truncateFrom(0) (16 items) | 21,730.13 | 0.0460 | 0.1587 |

## 2. Macro-Benchmarks

### Memory & GC Pressure - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Units (A/C/E) | 2,588.58 | 0.3863 | 1.2312 |
| Subscription Churn (1K cycles) | 31,099.60 | 0.0322 | 0.3912 |
| Circular Reference Cleanup (100 cycles) | 156,333.89 | 0.0064 | 0.0093 |
| 10K Entity State Tree Management | 1,615.58 | 0.6190 | 1.6080 |
| Heap Monitoring (1000 large atoms) | 3,368.23 | 0.2969 | 0.8410 |

### Data Grid (1000 Rows) - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,676.82 | 0.2138 | 0.4763 |
| [Atom] Initialize | 10,273,057.14 | 0.0001 | 0.0002 |
| [Vanilla] Toggle Sort | 4,543.24 | 0.2201 | 0.2376 |
| [Atom] Toggle Sort | 4,205.47 | 0.2378 | 0.2582 |
| [Vanilla] Switch Filter | 452,921.87 | 0.0022 | 0.0027 |
| [Atom] Switch Filter | 209,730.99 | 0.0048 | 0.0055 |
| [Vanilla] Sort + Filter + Paginate | 4,424.24 | 0.2260 | 0.3645 |
| [Atom] Sort + Filter + Paginate | 4,192.41 | 0.2385 | 0.2584 |
| [Manual] Update Single Cell (x100) | 16,314.35 | 0.0613 | 0.3615 |
| [Lens] Update Single Cell (x100) | 10,483.47 | 0.0954 | 0.4025 |
| Select/Deselect Rows (Set-based) | 13,645.21 | 0.0733 | 0.3948 |

### Dependency Graph Patterns - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 141,547.58 | 0.0071 | 0.0107 |
| Diamond Pattern (1 → 10 → 10 → 1) | 620,298.80 | 0.0016 | 0.0021 |
| Pyramid Pattern (50 levels) | 198,995.78 | 0.0050 | 0.0057 |
| Mixed Dependencies (100A → 200C) | 590,681.64 | 0.0017 | 0.0020 |
| Circular Avoidance (x100) | 768,096.53 | 0.0013 | 0.0016 |
| Conditional Dependencies (x100) | 188,904.78 | 0.0053 | 0.0058 |
| Array-based Selection (x100) | 192,923.32 | 0.0052 | 0.0059 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Full Workflow | 97,616.50 | 0.0102 | 0.0195 |
| [Atom] Full Workflow | 97,223.61 | 0.0103 | 0.0189 |

### Large Grid with Lenses (50x50)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update: 10 Random Cells | 199,610.14 | 0.0050 | 0.0064 |
| Bulk Update: Replace Grid (x100) | 416.40 | 2.4015 | 2.6821 |
| Read Performance: 2500 Lenses (x100) | 47.7178 | 20.9566 | 21.2868 |

### Recursive Lens Depth Stress

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read Depth 100 Lens Chain (x100) | 2,424.67 | 0.4124 | 0.4329 |
| Update Depth 100 Lens Chain | 5,632.12 | 0.1776 | 0.1907 |

## 3. Realistic-Benchmarks

### Frame Budget & Sync

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Manual] State Sync (100 atoms) | 505,953.90 | 0.0020 | 0.0028 |
| [Batch] State Sync (100 atoms) | 152,003.74 | 0.0066 | 0.0081 |

### Stability & Memory

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Heavy Component Lifecycle (x100) | 16,276.70 | 0.0614 | 0.3008 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Batch] Form Reset (20 fields, x100) | 5,431.82 | 0.1841 | 0.3540 |
| [Manual] Form Reset (20 fields, x100) | 75,925.87 | 0.0132 | 0.0176 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input-to-Render Latency (simulation) | 147.22 | 6.7925 | 8.6747 |
