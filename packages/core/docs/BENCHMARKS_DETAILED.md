# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-06-20
**Version**: v0.34.0

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These metrics represent pure engine execution time in isolation. Performance in practical applications will be influenced by external factors, including DOM reconciliation, layout calculations, and browser-specific optimizations.

---

## 1. Micro-Benchmarks

### Atom Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: plain object creation | 1,224,796.16 | 0.0008 | 0.0012 |
| creation: primitive atom | 804,025.11 | 0.0012 | 0.0020 |
| baseline: nested object creation | 1,074,734.77 | 0.0009 | 0.0015 |
| creation: object atom | 836,220.49 | 0.0012 | 0.0020 |
| baseline: plain object read/write | 6,992,895.16 | 0.0001 | 0.0004 |
| read/write performance: active | 1,030,469.56 | 0.0010 | 0.0015 |
| untracked read: active | 5,322,986.95 | 0.0002 | 0.0004 |
| baseline: plain object property read | 4,308,545.43 | 0.0002 | 0.0004 |
| atom.value read | 3,509,850.48 | 0.0003 | 0.0005 |
| atom.peek() read | 3,664,561.40 | 0.0003 | 0.0005 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 856,508.34 | 0.0012 | 0.0021 |
| creation: flat computed | 286,552.28 | 0.0035 | 0.0073 |
| creation: chained computed (10 levels) | 144,238.77 | 0.0069 | 0.0112 |
| baseline: raw chained function evaluation | 761,172.98 | 0.0013 | 0.0016 |
| recomputation & cache | 374,469.73 | 0.0027 | 0.0035 |
| lazy evaluation overhead | 355,295.86 | 0.0028 | 0.0041 |
| baseline: plain function call | 4,150,617.47 | 0.0002 | 0.0004 |
| computed.value read (active) | 3,170,146.52 | 0.0003 | 0.0005 |
| computed.peek() read (active) | 3,242,732.70 | 0.0003 | 0.0005 |
| creation: async computed | 667,372.94 | 0.0015 | 0.0023 |
| read: resolved value & state | 788,326.48 | 0.0013 | 0.0016 |
| resolution: promise resolving lifecycle | 77,419.54 | 0.0129 | 0.0214 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 817,643.91 | 0.0012 | 0.0021 |
| creation & disposal | 253,917.95 | 0.0039 | 0.0055 |
| baseline: raw callback propagation | 753,199.71 | 0.0013 | 0.0016 |
| propagation: atom → computed → effect | 1,043,779.71 | 0.0010 | 0.0015 |
| cleanup execution | 622,843.94 | 0.0016 | 0.0022 |
| baseline: Set add + delete | 876,455.97 | 0.0011 | 0.0029 |
| atom.subscribe + unsubscribe | 1,193,138.20 | 0.0008 | 0.0016 |
| computed.subscribe + unsubscribe | 1,124,329.10 | 0.0009 | 0.0015 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 1,319,288.27 | 0.0008 | 0.0011 |
| read: lens | 910,396.94 | 0.0011 | 0.0014 |
| read: computed active | 1,272,113.98 | 0.0008 | 0.0011 |
| read: direct object access | 1,274,806.50 | 0.0008 | 0.0011 |
| baseline: raw nested object write | 5,558,628.34 | 0.0002 | 0.0004 |
| write: lens | 256,862.84 | 0.0039 | 0.0049 |
| write: manual spread | 844,729.11 | 0.0012 | 0.0018 |
| composition & scaling (100 active lenses) | 2,316,651.12 | 0.0004 | 0.0009 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 3,981,083.95 | 0.0003 | 0.0006 |
| schedule 1 microtask | 1,617,158.40 | 0.0006 | 0.0011 |
| baseline: schedule 10 native microtasks (parallel) | 801,976.89 | 0.0012 | 0.0019 |
| schedule 10 microtasks (parallel) | 590,651.14 | 0.0017 | 0.0025 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,247,577.75 | 0.0004 | 0.0008 |
| untracked(() => read) | 3,699,764.49 | 0.0003 | 0.0005 |
| peek() read — no context | 4,305,440.83 | 0.0002 | 0.0004 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,321,310.88 | 0.0008 | 0.0013 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 376,373.46 | 0.0027 | 0.0041 |
| batched computed chain update (x10) | 176,665.06 | 0.0057 | 0.0086 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 25,793.17 | 0.0388 | 0.1084 |
| 1 to N propagation (Fan Out 1000) | 11,902.38 | 0.0840 | 0.2060 |
| N to 1 propagation (Fan In 1000) | 111,112.84 | 0.0090 | 0.0215 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 181,339.95 | 0.0055 | 0.0074 |
| isAtom checks | 172,601.31 | 0.0058 | 0.0066 |
| isComputed checks | 173,140.75 | 0.0058 | 0.0069 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 198,365.88 | 0.0050 | 0.0105 |
| diamond pattern (1 → 10 → 10 → 1) | 799,665.14 | 0.0013 | 0.0025 |
| pyramid pattern (50 levels) | 316,988.39 | 0.0032 | 0.0067 |
| mixed dependencies (100 atoms → 200 computeds) | 582,066.60 | 0.0017 | 0.0034 |
| circular avoidance (x10) | 811,939.00 | 0.0012 | 0.0025 |
| conditional dependencies (x10) | 382,938.69 | 0.0026 | 0.0033 |
| array-based selection (x10) | 356,888.73 | 0.0028 | 0.0052 |
| batch update: 10 random cells | 286,059.91 | 0.0035 | 0.0047 |
| bulk update: replace full grid | 60,969.93 | 0.0164 | 0.0320 |
| read performance: 2500 lenses | 2,435.40 | 0.4106 | 0.7253 |
| read depth 100 lens chain (x10) | 63,861.44 | 0.0157 | 0.0295 |
| update depth 100 lens chain | 82,386.03 | 0.0121 | 0.0217 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,645.26 | 0.2153 | 0.2405 |
| [Atom] Toggle Sort | 9,523.82 | 0.1050 | 0.2309 |
| [Vanilla] Switch Filter | 390,302.18 | 0.0026 | 0.0032 |
| [Atom] Switch Filter | 252,323.62 | 0.0040 | 0.0080 |
| [Vanilla] sort + filter + paginate | 4,397.85 | 0.2274 | 0.2669 |
| [Atom] sort + filter + paginate | 9,045.91 | 0.1105 | 0.2466 |
| [Manual] update single cell (x10) | 169,841.13 | 0.0059 | 0.0184 |
| [Lens] update single cell (x10) | 104,553.25 | 0.0096 | 0.0226 |
| select/deselect rows (Set-based) | 14,535.07 | 0.0688 | 0.2983 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 68,113.24 | 0.0147 | 0.0309 |
| subscription churn (1K cycles) | 22,005.75 | 0.0454 | 0.0793 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 61,377.83 | 0.0163 | 0.0277 |
| 10K entity state tree management | 361,073.43 | 0.0028 | 0.0038 |
| heap monitoring (1000 large atoms) | 2,848.29 | 0.3511 | 0.7288 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 348,530.94 | 0.0029 | 0.0044 |
| [Manual] form reset (20 fields) | 848,708.54 | 0.0012 | 0.0020 |
| [Batch] state sync (100 atoms) | 95,230.59 | 0.0105 | 0.0213 |
| [Manual] state sync (100 atoms) | 179,340.17 | 0.0056 | 0.0077 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 62,453.53 | 0.0160 | 0.0333 |
| [Atom] filter 1000 items (Fresh Computed each time) | 18,411.03 | 0.0543 | 0.1031 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 1,510,426.17 | 0.0007 | 0.0013 |
| [Vanilla] add items → apply coupon → total | 2,661,370.46 | 0.0004 | 0.0010 |
| [Atom] add items → apply coupon → total | 1,417,772.57 | 0.0007 | 0.0011 |
| [Vanilla] update source → recalc all KPIs | 6,770,454.76 | 0.0001 | 0.0002 |
| [Atom] update source → reactive KPI pipeline | 2,962,152.38 | 0.0003 | 0.0006 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 1,137,166.46 | 0.0009 | 0.0010 |
| [Atom] creation + first .value read | 869,910.49 | 0.0011 | 0.0017 |
| [Vanilla] function call (computed baseline) | 1,107,204.40 | 0.0009 | 0.0014 |
| [Atom] lazy computed creation + first eval | 323,918.69 | 0.0031 | 0.0052 |
| [Atom] eager computed creation + first eval | 310,858.40 | 0.0032 | 0.0038 |
| [Atom] effect creation + first run + dispose | 170,263.29 | 0.0059 | 0.0105 |
| [Vanilla] variable write + read | 1,143,668.89 | 0.0009 | 0.0010 |
| [Atom] atom write + computed propagation | 452,814.33 | 0.0022 | 0.0025 |
| [Atom] atom read only — warm cache | 1,292,537.73 | 0.0008 | 0.0008 |
| [Atom] computed read only — warm cache hit | 1,287,653.17 | 0.0008 | 0.0008 |
| [Cold] new computed each iteration | 323,437.34 | 0.0031 | 0.0051 |
| [Warm] reuse computed — cache hit (source unchanged) | 1,301,677.76 | 0.0008 | 0.0008 |
| [Warm] reuse computed — cache miss (source changed) | 840,096.51 | 0.0012 | 0.0015 |
| [Cold] effect create + first run + dispose | 211,731.67 | 0.0047 | 0.0066 |
| [Warm] effect repeated trigger (x100) | 286,901.92 | 0.0035 | 0.0039 |
