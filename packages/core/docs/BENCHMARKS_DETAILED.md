# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-04-20
**Version**: v0.31.0

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These metrics represent pure engine execution time in isolation. Performance in practical applications will be influenced by external factors, including DOM reconciliation, layout calculations, and browser-specific optimizations.

---

## 1. Micro-Benchmarks

### Atom Operations

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Create 100 Atoms (Primitives) | 129,113.56 | 0.0077 | 0.0181 |
| Create 100 Atoms (Objects) | 132,317.20 | 0.0076 | 0.0131 |
| Read/Write Performance (x100) | 414,094.17 | 0.0024 | 0.0031 |
| Untracked Read (x100) | 1,361,544.79 | 0.0007 | 0.0008 |

### Computed Operations

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Creation: Flat vs Chain (10 levels) | 680,805.92 | 0.0015 | 0.0019 |
| Recompute & Cache (x100) | 80,553.87 | 0.0124 | 0.0220 |
| Lazy Evaluation Overhead (x100) | 52,766.43 | 0.0190 | 0.0312 |

### Effect Operations

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Creation & Disposal (x100) | 48,252.96 | 0.0207 | 0.0356 |
| Propagation: Atom → Computed → Effect (x100) | 1,498,078.84 | 0.0007 | 0.0007 |
| Cleanup Execution (x100) | 708,315.45 | 0.0014 | 0.0016 |

### Lenses

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Read: Lens (x100) | 109,716.64 | 0.0091 | 0.0176 |
| Read: Computed Active (x100) | 176,233.53 | 0.0057 | 0.0063 |
| Read: Direct Object Access (x100) | 181,810.65 | 0.0055 | 0.0061 |
| Write: Lens (x100) | 49,266.86 | 0.0203 | 0.0304 |
| Write: Manual Spread (x100) | 301,746.22 | 0.0033 | 0.0047 |
| Composition & Scaling (100 active lenses) | 6,338.64 | 0.1578 | 3.6622 |

---

## 2. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 Propagation (Depth 1000) | 12,647.28 | 0.0791 | 0.1117 |
| 1 to N Propagation (Fan Out 1000) | 8,856.79 | 0.1129 | 0.1645 |
| N to 1 Propagation (Fan In 1000) | 68,263.43 | 0.0146 | 0.0238 |

### Internal Buffer Performance

Measurements for the `SlotBuffer` and `DepSlotBuffer` implementations.

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| SlotBuffer: Add 4 items (SVO) X100 | 653,809.60 | 0.0015 | 0.0020 |
| SlotBuffer: Push 4 items (Array baseline) X100 | 706,119.84 | 0.0014 | 0.0020 |
| SlotBuffer: Add 16 items (Overflow) X100 | 128,020.07 | 0.0078 | 0.0140 |
| SlotBuffer: pushEach 4 items (Array) X100 | 830,826.99 | 0.0012 | 0.0016 |
| DepSlotBuffer: ClaimExisting 4 items (Inline hit) X100 | 248,921.05 | 0.0040 | 0.0040 |
| DepSlotBuffer: ClaimExisting 64 items (Map fallback) X100 | 15,992.07 | 0.0625 | 0.0708 |

---

## 3. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Deep Chain (100 levels) | 128,584.50 | 0.0078 | 0.0126 |
| Diamond Pattern (1 → 10 → 10 → 1) | 525,343.61 | 0.0019 | 0.0023 |
| Pyramid Pattern (50 levels) | 184,694.26 | 0.0054 | 0.0086 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,454.92 | 0.2245 | 0.3996 |
| [Atom] Toggle Sort | 3,993.35 | 0.2504 | 0.4102 |
| [Vanilla] Switch Filter | 472,492.84 | 0.0021 | 0.0026 |
| [Atom] Switch Filter | 203,695.60 | 0.0049 | 0.0057 |

### Memory and Lifecycle

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Component Lifecycle (mount→update→unmount, x100) | 16,192.65 | 0.0618 | 0.2900 |
| Subscription Churn (1K cycles) | 38,447.28 | 0.0260 | 0.1370 |
| Create and Dispose 1000 Units | 1,702.50 | 0.5874 | 0.9553 |
