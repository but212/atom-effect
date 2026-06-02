# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-06-02
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
| creation: primitive atom | 939,219.75 | 0.0011 | 0.0019 |
| creation: object atom | 941,031.12 | 0.0011 | 0.0013 |
| read/write performance: active | 1,081,105.12 | 0.0009 | 0.0012 |
| untracked read: active | 3,302,370.24 | 0.0003 | 0.0004 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation: flat vs chain (10 levels) | 382,895.14 | 0.0026 | 0.0036 |
| recomputation & cache | 347,081.18 | 0.0029 | 0.0034 |
| lazy evaluation overhead | 119,417.41 | 0.0084 | 0.0139 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation & disposal | 227,035.72 | 0.0044 | 0.0068 |
| propagation: atom → computed → effect | 1,226,006.83 | 0.0008 | 0.0010 |
| cleanup execution | 609,231.50 | 0.0016 | 0.0020 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| read: lens | 969,410.60 | 0.0010 | 0.0016 |
| read: computed active | 1,361,472.10 | 0.0007 | 0.0011 |
| read: direct object access | 1,352,207.74 | 0.0007 | 0.0011 |
| write: lens | 243,700.39 | 0.0041 | 0.0073 |
| write: manual spread | 970,943.53 | 0.0010 | 0.0018 |
| composition & scaling (100 active lenses) | 2,477,717.09 | 0.0004 | 0.0007 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| schedule 1 microtask | 1,996,319.81 | 0.0005 | 0.0008 |
| schedule 10 microtasks (parallel) | 414,032.28 | 0.0024 | 0.0029 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,455,943.53 | 0.0004 | 0.0006 |
| untracked(() => read) | 3,486,732.05 | 0.0003 | 0.0003 |
| peek() read — no context | 3,768,580.90 | 0.0003 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,191,721.32 | 0.0008 | 0.0012 |
| flat batch | 332,651.92 | 0.0030 | 0.0036 |
| nested batch (3 levels) | 323,019.18 | 0.0031 | 0.0045 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 22,723.83 | 0.0440 | 0.1042 |
| 1 to N propagation (Fan Out 1000) | 11,101.15 | 0.0901 | 0.1305 |
| N to 1 propagation (Fan In 1000) | 91,084.44 | 0.0110 | 0.0297 |

---

## 4. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 183,775.41 | 0.0054 | 0.0143 |
| diamond pattern (1 → 10 → 10 → 1) | 802,559.08 | 0.0012 | 0.0026 |
| pyramid pattern (50 levels) | 268,273.43 | 0.0037 | 0.0085 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,885.42 | 0.2047 | 0.2418 |
| [Atom] Toggle Sort | 9,289.80 | 0.1076 | 0.2380 |
| [Vanilla] Switch Filter | 383,012.99 | 0.0026 | 0.0032 |
| [Atom] Switch Filter | 264,669.60 | 0.0038 | 0.0077 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 46,152.86 | 0.0217 | 0.0479 |
| subscription churn (1K cycles) | 13,370.36 | 0.0748 | 0.3682 |
| create and dispose 1000 units | 798.34 | 1.2526 | 3.6764 |
