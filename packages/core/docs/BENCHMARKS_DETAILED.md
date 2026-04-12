# Benchmark Results - Detailed

**Last Updated**: 2026-04-12
**Version**: v0.30.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Atoms (Primitives) | 312,822.85 | 0.0032 | 0.0061 |
| Create 100 Atoms (Objects) | 306,999.70 | 0.0033 | 0.0051 |
| Read/Write Performance (x100) | 1,144,191.97 | 0.0009 | 0.0010 |
| Untracked Read (x100) | 1,715,670.93 | 0.0006 | 0.0009 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Recompute & Cache (x100) | 236,297.88 | 0.0042 | 0.0060 |
| Lazy Evaluation Overhead (x100) | 72,974.77 | 0.0137 | 0.0235 |
| Creation: Flat vs Chain (10 levels) | 594,710.43 | 0.0017 | 0.0030 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Creation & Disposal (x100) | 59,338.11 | 0.0169 | 0.0284 |
| Propagation: Atom → Computed → Effect (x100) | 1,095,885.70 | 0.0009 | 0.0011 |
| Cleanup Execution (x100) | 656,284.62 | 0.0015 | 0.0021 |

### Lenses - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read: Lens (x100) | 232,853.92 | 0.0043 | 0.0047 |
| Read: Computed Active (x100) | 925,633.42 | 0.0011 | 0.0012 |
| Read: Direct Object Access (x100) | 850,739.09 | 0.0012 | 0.0024 |
| Write: Lens (x100) | 24,018.46 | 0.0416 | 0.0474 |
| Write: Manual Spread (x100) | 313,245.83 | 0.0032 | 0.0043 |
| Composition & Scaling (100 active) | 5,811.67 | 0.1721 | 3.9306 |

### Batch & Synchronization - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update 100 Atoms (x100) | 21,577.94 | 0.0463 | 0.0543 |
| Batched Computed Chain Update (x100) | 31,581.64 | 0.0317 | 0.0434 |

### Propagation - Stress Tests (1000 nodes)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 Propagation (Depth 1000) | 15,443.79 | 0.0648 | 0.2080 |
| 1 to N Propagation (Fan Out 1000) | 17,573.50 | 0.0569 | 0.0850 |
| N to 1 Propagation (Fan In 1000) | 68,104.33 | 0.0147 | 0.0192 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (SlotBuffer) X100 | 609,705.67 | 0.0016 | 0.0028 |
| SlotBuffer: Push 4 items (Array baseline) X100 | 511,534.54 | 0.0020 | 0.0037 |
| SlotBuffer: Add 16 items (SlotBuffer spill) X100 | 112,981.01 | 0.0089 | 0.0161 |
| SlotBuffer: Push 16 items (Array baseline) X100 | 218,113.27 | 0.0046 | 0.0067 |
| SlotBuffer: Remove 8 and Add 8 (Reuse) X100 | 42,700.45 | 0.0234 | 0.0363 |
| SlotBuffer: forEach 16 items (SlotBuffer) X100 | 254,318.59 | 0.0039 | 0.0052 |
| SlotBuffer: Compact 16 items with 8 gaps X100 | 28,272.55 | 0.0354 | 0.0471 |
| DepSlotBuffer: ClaimExisting (Inline hit) | 252,056.62 | 0.0040 | 0.0043 |
| DepSlotBuffer: ClaimExisting (Map fallback 64) | 14,944.98 | 0.0669 | 0.0757 |
| DepSlotBuffer: truncateFrom(0) (16 items) | 20,045.65 | 0.0499 | 0.1450 |

## 2. Macro-Benchmarks

### Memory & GC Pressure - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Units (A/C/E) | 1,559.41 | 0.6413 | 1.0752 |
| Subscription Churn (1K cycles) | 33,225.65 | 0.0301 | 0.1383 |
| Circular Reference Cleanup (100 cycles) | 185,739.81 | 0.0054 | 0.0095 |
| 10K Entity State Tree Management | 1,690.21 | 0.5916 | 0.9927 |
| Heap Monitoring (1000 large atoms) | 3,724.82 | 0.2685 | 0.4788 |

### Data Grid (1000 Rows) - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Toggle Sort | 4,552.90 | 0.2196 | 0.2390 |
| [Atom] Toggle Sort | 4,176.49 | 0.2394 | 0.3888 |
| [Vanilla] Switch Filter | 463,109.45 | 0.0022 | 0.0028 |
| [Atom] Switch Filter | 223,161.48 | 0.0045 | 0.0054 |
| [Vanilla] Sort + Filter + Paginate | 4,434.05 | 0.2255 | 0.2487 |
| [Atom] Sort + Filter + Paginate | 4,208.73 | 0.2376 | 0.2611 |
| [Manual] Update Single Cell (x100) | 21,313.99 | 0.0469 | 0.1732 |
| [Lens] Update Single Cell (x100) | 13,433.25 | 0.0744 | 0.2105 |
| Select/Deselect Rows (Set-based) | 15,513.46 | 0.0645 | 0.1989 |

### Dependency Graph Patterns - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 111,287.89 | 0.0090 | 0.0154 |
| Diamond Pattern (1 → 10 → 10 → 1) | 513,745.21 | 0.0019 | 0.0033 |
| Pyramid Pattern (50 levels) | 173,411.59 | 0.0058 | 0.0079 |
| Mixed Dependencies (100A → 200C) | 566,896.84 | 0.0018 | 0.0024 |
| Circular Avoidance (x100) | 778,528.95 | 0.0013 | 0.0017 |
| Conditional Dependencies (x100) | 196,941.69 | 0.0051 | 0.0058 |
| Array-based Selection (x100) | 199,995.89 | 0.0050 | 0.0054 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Full Workflow | 98,932.41 | 0.0101 | 0.0182 |
| [Atom] Full Workflow | 98,948.11 | 0.0101 | 0.0182 |

### Large Grid with Lenses (50x50)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update: 10 Random Cells | 217,068.14 | 0.0046 | 0.0069 |
| Bulk Update: Replace Grid | 48,152.92 | 0.0208 | 0.3294 |
| Read Performance: 2500 Lenses | 4,767.67 | 0.2097 | 0.2428 |

### Recursive Lens Depth Stress

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Read Depth 100 Lens Chain (x100) | 2,447.05 | 0.4087 | 0.4327 |
| Update Depth 100 Lens Chain | 5,692.69 | 0.1757 | 0.1885 |

## 3. Realistic-Benchmarks

### Frame Budget & Sync

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Manual] State Sync (100 atoms) | 560,137.46 | 0.0018 | 0.0022 |
| [Batch] State Sync (100 atoms) | 149,389.48 | 0.0067 | 0.0098 |

### Stability & Memory

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Heavy Component Lifecycle (x100) | 16,103.76 | 0.0621 | 0.2486 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Batch] Form Reset (20 fields, x100) | 6,297.22 | 0.1588 | 0.3172 |
| [Manual] Form Reset (20 fields, x100) | 76,995.71 | 0.0130 | 0.0174 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input-to-Render Latency (simulation) | 150.89 | 6.6273 | 7.7156 |
