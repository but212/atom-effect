# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-05-19
**Version**: v0.32.1

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These metrics represent pure engine execution time in isolation. Performance in practical applications will be influenced by external factors, including DOM reconciliation, layout calculations, and browser-specific optimizations.

---

## 1. Micro-Benchmarks

### Atom Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation: primitive atom | 1,002,541.69 | 0.0010 | 0.0012 |
| creation: object atom | 991,826.23 | 0.0010 | 0.0013 |
| read/write performance: active | 971,979.96 | 0.0010 | 0.0015 |
| untracked read: active | 3,096,756.62 | 0.0003 | 0.0004 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation: flat vs chain (10 levels) | 471,480.57 | 0.0021 | 0.0027 |
| recomputation & cache | 376,983.35 | 0.0027 | 0.0030 |
| lazy evaluation overhead | 327,460.85 | 0.0031 | 0.0042 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation & disposal | 247,732.17 | 0.0040 | 0.0046 |
| propagation: atom → computed → effect | 1,260,437.38 | 0.0008 | 0.0010 |
| cleanup execution | 721,972.93 | 0.0014 | 0.0022 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| read: lens | 917,289.24 | 0.0011 | 0.0011 |
| read: computed active | 1,300,433.94 | 0.0008 | 0.0008 |
| read: direct object access | 1,291,167.29 | 0.0008 | 0.0008 |
| write: lens | 222,180.97 | 0.0045 | 0.0049 |
| write: manual spread | 949,673.05 | 0.0011 | 0.0013 |
| composition & scaling (100 active lenses) | 2,499,400.98 | 0.0004 | 0.0005 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| schedule 1 microtask | 2,207,522.24 | 0.0005 | 0.0008 |
| schedule 10 microtasks (parallel) | 441,408.77 | 0.0023 | 0.0026 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,446,242.91 | 0.0004 | 0.0006 |
| untracked(() => read) | 3,466,631.72 | 0.0003 | 0.0003 |
| peek() read — no context | 3,676,409.87 | 0.0003 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,176,507.62 | 0.0008 | 0.0011 |
| flat batch | 313,124.17 | 0.0032 | 0.0035 |
| nested batch (3 levels) | 308,885.99 | 0.0032 | 0.0036 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 17,166.31 | 0.0583 | 0.1310 |
| 1 to N propagation (Fan Out 1000) | 12,484.66 | 0.0801 | 0.1158 |
| N to 1 propagation (Fan In 1000) | 94,319.66 | 0.0106 | 0.0303 |

---

## 4. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 227,628.80 | 0.0044 | 0.0131 |
| diamond pattern (1 → 10 → 10 → 1) | 901,795.50 | 0.0011 | 0.0020 |
| pyramid pattern (50 levels) | 323,696.18 | 0.0031 | 0.0061 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,520.70 | 0.2212 | 0.2570 |
| [Atom] Toggle Sort | 8,147.80 | 0.1227 | 0.3110 |
| [Vanilla] Switch Filter | 446,577.67 | 0.0022 | 0.0028 |
| [Atom] Switch Filter | 331,569.62 | 0.0030 | 0.0061 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 71,486.59 | 0.0140 | 0.0293 |
| subscription churn (1K cycles) | 31,307.07 | 0.0319 | 0.1424 |
| create and dispose 1000 units | 829.88 | 1.2050 | 1.8575 |
