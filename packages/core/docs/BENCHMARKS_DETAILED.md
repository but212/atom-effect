# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-05-09
**Version**: v0.32.0

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These metrics represent pure engine execution time in isolation. Performance in practical applications will be influenced by external factors, including DOM reconciliation, layout calculations, and browser-specific optimizations.

---

## 1. Micro-Benchmarks

### Atom Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation: primitive atom | 1,024,115.55 | 0.0010 | 0.0016 |
| creation: object atom | 976,865.03 | 0.0010 | 0.0015 |
| read/write performance: active | 650,554.58 | 0.0015 | 0.0031 |
| untracked read: active | 3,169,739.49 | 0.0003 | 0.0004 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation: flat vs chain (10 levels) | 406,075.98 | 0.0025 | 0.0030 |
| recomputation & cache | 343,077.85 | 0.0029 | 0.0051 |
| lazy evaluation overhead | 308,140.54 | 0.0032 | 0.0046 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| creation & disposal | 175,194.61 | 0.0057 | 0.0114 |
| propagation: atom → computed → effect | 1,132,703.91 | 0.0009 | 0.0016 |
| cleanup execution | 580,155.58 | 0.0017 | 0.0024 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| read: lens | 845,040.39 | 0.0012 | 0.0013 |
| read: computed active | 1,297,007.76 | 0.0008 | 0.0008 |
| read: direct object access | 1,310,369.69 | 0.0008 | 0.0008 |
| write: lens | 156,782.06 | 0.0064 | 0.0119 |
| write: manual spread | 811,930.26 | 0.0012 | 0.0021 |
| composition & scaling (100 active lenses) | 1,726,098.33 | 0.0006 | 0.0008 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| schedule 1 microtask | 2,192,927.50 | 0.0005 | 0.0008 |
| schedule 10 microtasks (parallel) | 430,984.04 | 0.0023 | 0.0030 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,059,482.21 | 0.0005 | 0.0007 |
| untracked(() => read) | 3,200,995.78 | 0.0003 | 0.0004 |
| peek() read — no context | 3,965,276.07 | 0.0003 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 685,239.01 | 0.0015 | 0.0035 |
| flat batch | 197,750.91 | 0.0051 | 0.0099 |
| nested batch (3 levels) | 196,658.77 | 0.0051 | 0.0099 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 30,043.77 | 0.0333 | 0.0933 |
| 1 to N propagation (Fan Out 1000) | 12,093.17 | 0.0827 | 0.1413 |
| N to 1 propagation (Fan In 1000) | 123,938.83 | 0.0081 | 0.0190 |

---

## 4. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 263,684.94 | 0.0038 | 0.0145 |
| diamond pattern (1 → 10 → 10 → 1) | 856,122.89 | 0.0012 | 0.0034 |
| pyramid pattern (50 levels) | 338,755.90 | 0.0030 | 0.0098 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,555.94 | 0.2195 | 0.2464 |
| [Atom] Toggle Sort | 8,560.10 | 0.1168 | 0.2778 |
| [Vanilla] Switch Filter | 480,725.75 | 0.0021 | 0.0026 |
| [Atom] Switch Filter | 365,178.33 | 0.0027 | 0.0054 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 84,031.70 | 0.0119 | 0.0221 |
| subscription churn (1K cycles) | 11,806.73 | 0.0847 | 2.5826 |
| create and dispose 1000 units | 911.64 | 1.0969 | 4.1239 |
