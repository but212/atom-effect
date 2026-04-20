# Benchmark Results - Detailed

**Last Updated**: 2026-04-20
**Version**: v0.31.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Atoms (Primitives) | 129,113.56 | 0.0077 | 0.0181 |
| Create 100 Atoms (Objects) | 132,317.20 | 0.0076 | 0.0131 |
| Read/Write Performance (x100) | 414,094.17 | 0.0024 | 0.0031 |
| Untracked Read (x100) | 1,361,544.79 | 0.0007 | 0.0008 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Creation: Flat vs Chain (10 levels) | 680,805.92 | 0.0015 | 0.0019 |
| Recompute & Cache (x100) | 80,553.87 | 0.0124 | 0.0220 |
| Lazy Evaluation Overhead (x100) | 52,766.43 | 0.0190 | 0.0312 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Creation & Disposal (x100) | 48,252.96 | 0.0207 | 0.0356 |
| Propagation: Atom → Computed → Effect (x100) | 1,498,078.84 | 0.0007 | 0.0007 |
| Cleanup Execution (x100) | 708,315.45 | 0.0014 | 0.0016 |

### Lenses - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read: Lens (x100) | 109,716.64 | 0.0091 | 0.0176 |
| Read: Computed Active (x100) | 176,233.53 | 0.0057 | 0.0063 |
| Read: Direct Object Access (x100) | 181,810.65 | 0.0055 | 0.0061 |
| Write: Lens (x100) | 49,266.86 | 0.0203 | 0.0304 |
| Write: Manual Spread (x100) | 301,746.22 | 0.0033 | 0.0047 |
| Composition & Scaling (100 active lenses) | 6,338.64 | 0.1578 | 3.6622 |

### Batch & Synchronization - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update 100 Atoms (x100) | 64,792.76 | 0.0154 | 0.0247 |
| Batched Computed Chain Update (x100) | 27,355.65 | 0.0366 | 0.0780 |

### Propagation - Stress Tests (1000 nodes)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 Propagation (Depth 1000) | 12,647.28 | 0.0791 | 0.1117 |
| 1 to N Propagation (Fan Out 1000) | 8,856.79 | 0.1129 | 0.1645 |
| N to 1 Propagation (Fan In 1000) | 68,263.43 | 0.0146 | 0.0238 |

### Internal Structures (SlotBuffer / DepSlotBuffer)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (SlotBuffer) X100 | 653,809.60 | 0.0015 | 0.0020 |
| SlotBuffer: Push 4 items (Array baseline) X100 | 706,119.84 | 0.0014 | 0.0020 |
| SlotBuffer: Add 16 items (SlotBuffer spill) X100 | 128,020.07 | 0.0078 | 0.0140 |
| SlotBuffer: Push 16 items (Array baseline) X100 | 341,070.20 | 0.0029 | 0.0035 |
| SlotBuffer: Remove 8 + Add 8 (O(1) Reuse) X100 | 43,335.96 | 0.0231 | 0.0345 |
| SlotBuffer: forEach 4 items (SlotBuffer) X100 | 1,623,983.87 | 0.0006 | 0.0006 |
| SlotBuffer: forEach 4 items (Array) X100 | 830,826.99 | 0.0012 | 0.0016 |
| SlotBuffer: forEach 16 items (SlotBuffer) X100 | 415,988.70 | 0.0024 | 0.0028 |
| SlotBuffer: forEach 16 items (Array) X100 | 242,636.38 | 0.0041 | 0.0048 |
| SlotBuffer: Compact 16 items with 8 gaps X100 | 26,313.56 | 0.0380 | 0.0518 |
| SlotBuffer: Filter nulls (Array baseline) X100 | 155,134.55 | 0.0064 | 0.0116 |
| DepSlotBuffer: ClaimExisting 4 items (Inline hit) X100 | 248,921.05 | 0.0040 | 0.0040 |
| DepSlotBuffer: ClaimExisting 16 items (Overflow hit) X100 | 24,017.68 | 0.0416 | 0.0612 |
| DepSlotBuffer: ClaimExisting 64 items (Map fallback) X100 | 15,992.07 | 0.0625 | 0.0708 |
| DepSlotBuffer: truncateFrom(0) with 16 items X100 | 25,856.54 | 0.0387 | 0.1345 |

## 2. Macro-Benchmarks

### Todo App: Comprehensive Workflow

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Full Workflow (add→toggle→filter→delete→stats) | 97,206.28 | 0.0103 | 0.0207 |
| [Atom] Full Workflow (add→toggle→filter→delete→stats) | 96,790.28 | 0.0103 | 0.0208 |

### Data Grid: Core Operations (1000 Rows)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Toggle Sort | 4,454.92 | 0.2245 | 0.3996 |
| [Atom] Toggle Sort | 3,993.35 | 0.2504 | 0.4102 |
| [Vanilla] Switch Filter | 472,492.84 | 0.0021 | 0.0026 |
| [Atom] Switch Filter | 203,695.60 | 0.0049 | 0.0057 |
| [Vanilla] Sort + Filter + Paginate | 4,394.78 | 0.2275 | 0.2583 |
| [Atom] Sort + Filter + Paginate | 4,123.92 | 0.2425 | 0.2797 |

### Data Grid: Targeted Updates

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Manual] Update Single Cell (x100) | 22,167.23 | 0.0451 | 0.1833 |
| [Lens] Update Single Cell (x100) | 14,891.28 | 0.0672 | 0.2063 |
| Select/Deselect Rows (Set-based) | 17,181.78 | 0.0582 | 0.1851 |

### Dependency Graph Patterns

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 128,584.50 | 0.0078 | 0.0126 |
| Diamond Pattern (1 → 10 → 10 → 1) | 525,343.61 | 0.0019 | 0.0023 |
| Pyramid Pattern (50 levels) | 184,694.26 | 0.0054 | 0.0086 |

### Complex Graph Architecture

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mixed Dependencies (100 atoms → 200 computeds) | 583,530.23 | 0.0017 | 0.0021 |
| Circular Avoidance (x100) | 748,986.64 | 0.0013 | 0.0015 |

### Dynamic Dependency Patterns

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Conditional Dependencies (x100) | 66,782.78 | 0.0150 | 0.0241 |
| Array-based Selection (x100) | 71,214.70 | 0.0140 | 0.0232 |

### Large Grid with Lenses (50×50)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update: 10 Random Cells | 252,092.46 | 0.0040 | 0.0048 |
| Bulk Update: Replace Full Grid | 63,700.25 | 0.0157 | 0.3337 |
| Read Performance: 2500 Lenses | 3,727.14 | 0.2683 | 0.2899 |

### Recursive Lens Depth Stress

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read Depth 100 Lens Chain (x100) | 2,572.23 | 0.3888 | 0.4586 |
| Update Depth 100 Lens Chain | 6,683.62 | 0.1496 | 0.1722 |

### Memory & GC Pressure

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create and Dispose 1000 Units (atom/comp/effect) | 1,702.50 | 0.5874 | 0.9553 |
| Subscription Churn (1K cycles) | 38,447.28 | 0.0260 | 0.1370 |
| Circular Reference Cleanup (100 cycles) | 179,115.81 | 0.0056 | 0.0093 |

### Large State Analysis

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 10K Entity State Tree Management | 1,682.02 | 0.5945 | 0.9595 |
| Heap Monitoring (1000 large atoms) | 3,404.94 | 0.2937 | 0.5441 |

## 3. Realistic-Benchmarks

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Batch] Form Reset (20 fields, x100) | 7,166.72 | 0.1395 | 0.2657 |
| [Manual] Form Reset (20 fields, x100) | 72,449.93 | 0.0138 | 0.0219 |
| [Batch] State Sync (100 atoms) | 175,329.40 | 0.0057 | 0.0065 |
| [Manual] State Sync (100 atoms) | 566,463.62 | 0.0018 | 0.0020 |

### Stability: Component Churn & Memory

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Heavy Component Lifecycle (mount→update→unmount, x100) | 16,192.65 | 0.0618 | 0.2900 |
