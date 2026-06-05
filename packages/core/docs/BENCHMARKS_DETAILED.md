# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-06-05
**Version**: v0.33.1

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These metrics represent pure engine execution time in isolation. Performance in practical applications will be influenced by external factors, including DOM reconciliation, layout calculations, and browser-specific optimizations.

---

## 1. Micro-Benchmarks

### Atom Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation: primitive atom | 985,671.26 | 0.0010 | 0.0018 |
| creation: object atom | 992,978.84 | 0.0010 | 0.0012 |
| read/write performance: active | 1,021,756.77 | 0.0010 | 0.0012 |
| untracked read: active | 3,218,685.22 | 0.0003 | 0.0003 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation: flat vs chain (10 levels) | 444,750.07 | 0.0022 | 0.0026 |
| recomputation & cache | 371,419.89 | 0.0027 | 0.0030 |
| lazy evaluation overhead | 288,569.12 | 0.0035 | 0.0080 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation & disposal | 213,048.39 | 0.0047 | 0.0049 |
| propagation: atom → computed → effect | 1,145,214.87 | 0.0009 | 0.0010 |
| cleanup execution | 663,247.68 | 0.0015 | 0.0017 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| read: lens | 921,454.31 | 0.0011 | 0.0012 |
| read: computed active | 1,309,417.75 | 0.0008 | 0.0008 |
| read: direct object access | 1,291,958.26 | 0.0008 | 0.0008 |
| write: lens | 226,753.07 | 0.0044 | 0.0051 |
| write: manual spread | 977,730.24 | 0.0010 | 0.0013 |
| composition & scaling (100 active lenses) | 2,398,331.60 | 0.0004 | 0.0005 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| schedule 1 microtask | 2,224,162.63 | 0.0004 | 0.0008 |
| schedule 10 microtasks (parallel) | 441,400.51 | 0.0023 | 0.0026 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,430,248.61 | 0.0004 | 0.0006 |
| untracked(() => read) | 3,631,237.25 | 0.0003 | 0.0003 |
| peek() read — no context | 3,936,712.25 | 0.0003 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,155,254.79 | 0.0009 | 0.0011 |
| flat batch | 311,893.02 | 0.0032 | 0.0036 |
| nested batch (3 levels) | 301,919.17 | 0.0033 | 0.0037 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 25,294.58 | 0.0395 | 0.0981 |
| 1 to N propagation (Fan Out 1000) | 11,465.78 | 0.0872 | 0.1295 |
| N to 1 propagation (Fan In 1000) | 94,650.18 | 0.0106 | 0.0300 |

---

## 4. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 205,521.15 | 0.0049 | 0.0143 |
| diamond pattern (1 → 10 → 10 → 1) | 837,228.40 | 0.0012 | 0.0023 |
| pyramid pattern (50 levels) | 286,909.31 | 0.0035 | 0.0071 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 5,026.74 | 0.1989 | 0.2369 |
| [Atom] Toggle Sort | 9,208.76 | 0.1086 | 0.2382 |
| [Vanilla] Switch Filter | 422,338.37 | 0.0024 | 0.0028 |
| [Atom] Switch Filter | 249,515.56 | 0.0040 | 0.0080 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 85,778.74 | 0.0117 | 0.0238 |
| subscription churn (1K cycles) | 24,202.51 | 0.0413 | 0.1743 |
| create and dispose 1000 units | 958.90 | 1.0429 | 1.7037 |
