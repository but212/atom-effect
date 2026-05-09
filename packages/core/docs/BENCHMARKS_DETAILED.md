# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-05-10
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
| creation: primitive atom | 1,040,903.10 | 0.0010 | 0.0014 |
| creation: object atom | 1,021,123.99 | 0.0010 | 0.0013 |
| read/write performance: active | 653,350.32 | 0.0015 | 0.0031 |
| untracked read: active | 3,160,084.83 | 0.0003 | 0.0004 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation: flat vs chain (10 levels) | 433,605.77 | 0.0023 | 0.0031 |
| recomputation & cache | 351,363.40 | 0.0028 | 0.0049 |
| lazy evaluation overhead | 321,933.70 | 0.0031 | 0.0053 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation & disposal | 181,556.79 | 0.0055 | 0.0110 |
| propagation: atom → computed → effect | 1,141,308.36 | 0.0009 | 0.0015 |
| cleanup execution | 589,351.85 | 0.0017 | 0.0022 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| read: lens | 861,415.80 | 0.0012 | 0.0012 |
| read: computed active | 1,319,834.62 | 0.0008 | 0.0008 |
| read: direct object access | 1,320,466.26 | 0.0008 | 0.0008 |
| write: lens | 161,415.23 | 0.0062 | 0.0104 |
| write: manual spread | 859,883.28 | 0.0012 | 0.0016 |
| composition & scaling (100 active lenses) | 1,794,824.40 | 0.0006 | 0.0007 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| schedule 1 microtask | 2,255,007.31 | 0.0004 | 0.0007 |
| schedule 10 microtasks (parallel) | 441,131.19 | 0.0023 | 0.0028 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,070,654.30 | 0.0005 | 0.0007 |
| untracked(() => read) | 3,127,825.66 | 0.0003 | 0.0003 |
| peek() read — no context | 3,820,507.84 | 0.0003 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 732,296.38 | 0.0014 | 0.0027 |
| flat batch | 199,914.54 | 0.0050 | 0.0098 |
| nested batch (3 levels) | 199,934.63 | 0.0050 | 0.0097 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 29,276.65 | 0.0342 | 0.0873 |
| 1 to N propagation (Fan Out 1000) | 12,418.48 | 0.0805 | 0.1207 |
| N to 1 propagation (Fan In 1000) | 122,288.19 | 0.0082 | 0.0212 |

---

## 4. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 211,298.63 | 0.0047 | 0.0153 |
| diamond pattern (1 → 10 → 10 → 1) | 808,408.18 | 0.0012 | 0.0034 |
| pyramid pattern (50 levels) | 302,080.55 | 0.0033 | 0.0097 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 5,026.56 | 0.1989 | 0.2441 |
| [Atom] Toggle Sort | 9,543.15 | 0.1048 | 0.2423 |
| [Vanilla] Switch Filter | 400,502.12 | 0.0025 | 0.0030 |
| [Atom] Switch Filter | 347,791.25 | 0.0029 | 0.0056 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 77,616.78 | 0.0129 | 0.0253 |
| subscription churn (1K cycles) | 11,345.86 | 0.0881 | 2.6938 |
| create and dispose 1000 units | 855.33 | 1.1691 | 4.7246 |
