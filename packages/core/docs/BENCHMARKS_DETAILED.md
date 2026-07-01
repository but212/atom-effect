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
| baseline: plain object creation | 1,171,113.73 | 0.0009 | 0.0012 |
| creation: primitive atom | 904,274.23 | 0.0011 | 0.0015 |
| baseline: nested object creation | 1,126,312.20 | 0.0009 | 0.0010 |
| creation: object atom | 879,374.51 | 0.0011 | 0.0016 |
| baseline: plain object read/write | 6,688,827.35 | 0.0001 | 0.0002 |
| read/write performance: active | 1,172,117.86 | 0.0009 | 0.0018 |
| untracked read: active | 5,118,497.99 | 0.0002 | 0.0002 |
| baseline: plain object property read | 3,513,579.78 | 0.0003 | 0.0003 |
| atom.value read | 2,923,144.28 | 0.0003 | 0.0004 |
| atom.peek() read | 3,059,311.27 | 0.0003 | 0.0004 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 1,077,833.61 | 0.0009 | 0.0014 |
| creation: flat computed | 341,797.05 | 0.0029 | 0.0064 |
| creation: chained computed (10 levels) | 431,872.30 | 0.0023 | 0.0062 |
| baseline: raw chained function evaluation | 731,259.84 | 0.0014 | 0.0022 |
| recomputation & cache | 362,799.50 | 0.0028 | 0.0035 |
| lazy evaluation overhead | 317,624.62 | 0.0031 | 0.0083 |
| baseline: plain function call | 3,536,982.08 | 0.0003 | 0.0003 |
| computed.value read (active) | 2,740,756.00 | 0.0004 | 0.0004 |
| computed.peek() read (active) | 3,067,379.87 | 0.0003 | 0.0004 |
| creation: async computed | 635,155.87 | 0.0016 | 0.0024 |
| read: resolved value & state | 722,191.76 | 0.0014 | 0.0015 |
| resolution: promise resolving lifecycle | 70,934.42 | 0.0141 | 0.0229 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 933,177.93 | 0.0011 | 0.0016 |
| creation & disposal | 243,024.36 | 0.0041 | 0.0058 |
| baseline: raw callback propagation | 690,655.98 | 0.0014 | 0.0015 |
| propagation: atom → computed → effect | 1,161,557.20 | 0.0009 | 0.0013 |
| cleanup execution | 610,876.58 | 0.0016 | 0.0020 |
| baseline: Set add + delete | 910,503.01 | 0.0011 | 0.0025 |
| atom.subscribe + unsubscribe | 1,465,808.57 | 0.0007 | 0.0011 |
| computed.subscribe + unsubscribe | 1,467,773.54 | 0.0007 | 0.0011 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 1,236,581.39 | 0.0008 | 0.0009 |
| read: lens | 789,784.20 | 0.0013 | 0.0014 |
| read: computed active | 1,191,235.91 | 0.0008 | 0.0009 |
| read: direct object access | 1,193,491.44 | 0.0008 | 0.0009 |
| baseline: raw nested object write | 4,322,673.67 | 0.0002 | 0.0003 |
| write: lens | 220,054.00 | 0.0045 | 0.0055 |
| write: manual spread | 858,488.46 | 0.0012 | 0.0016 |
| composition & scaling (100 active lenses) | 2,283,632.61 | 0.0004 | 0.0007 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 4,602,030.43 | 0.0002 | 0.0004 |
| schedule 1 microtask | 1,961,629.55 | 0.0005 | 0.0008 |
| baseline: schedule 10 native microtasks (parallel) | 895,666.61 | 0.0011 | 0.0016 |
| schedule 10 microtasks (parallel) | 584,146.30 | 0.0017 | 0.0022 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,414,211.11 | 0.0004 | 0.0006 |
| untracked(() => read) | 3,617,952.86 | 0.0003 | 0.0003 |
| peek() read — no context | 3,839,359.86 | 0.0003 | 0.0004 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,366,239.05 | 0.0007 | 0.0010 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 377,331.42 | 0.0027 | 0.0047 |
| batched computed chain update (x10) | 171,691.51 | 0.0058 | 0.0094 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 19,246.98 | 0.0520 | 0.1225 |
| 1 to N propagation (Fan Out 1000) | 10,538.11 | 0.0949 | 0.2106 |
| N to 1 propagation (Fan In 1000) | 94,217.09 | 0.0106 | 0.0290 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 173,591.71 | 0.0058 | 0.0098 |
| isAtom checks | 161,850.58 | 0.0062 | 0.0113 |
| isComputed checks | 160,569.07 | 0.0062 | 0.0114 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 176,342.69 | 0.0057 | 0.0125 |
| diamond pattern (1 → 10 → 10 → 1) | 723,804.80 | 0.0014 | 0.0028 |
| pyramid pattern (50 levels) | 313,910.83 | 0.0032 | 0.0067 |
| mixed dependencies (100 atoms → 200 computeds) | 600,727.35 | 0.0017 | 0.0023 |
| circular avoidance (x10) | 692,835.40 | 0.0014 | 0.0021 |
| conditional dependencies (x10) | 373,569.83 | 0.0027 | 0.0034 |
| array-based selection (x10) | 360,818.37 | 0.0028 | 0.0034 |
| batch update: 10 random cells | 243,505.06 | 0.0041 | 0.0052 |
| bulk update: replace full grid | 52,838.33 | 0.0189 | 0.0467 |
| read performance: 2500 lenses | 2,425.35 | 0.4123 | 0.7398 |
| read depth 100 lens chain (x10) | 74,848.70 | 0.0134 | 0.0251 |
| update depth 100 lens chain | 81,657.04 | 0.0122 | 0.0175 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,616.07 | 0.2166 | 0.2405 |
| [Atom] Toggle Sort | 10,023.64 | 0.0998 | 0.2154 |
| [Vanilla] Switch Filter | 401,131.63 | 0.0025 | 0.0030 |
| [Atom] Switch Filter | 258,336.62 | 0.0039 | 0.0077 |
| [Vanilla] sort + filter + paginate | 4,423.12 | 0.2261 | 0.2502 |
| [Atom] sort + filter + paginate | 9,579.87 | 0.1044 | 0.2253 |
| [Manual] update single cell (x10) | 190,892.61 | 0.0052 | 0.0100 |
| [Lens] update single cell (x10) | 113,375.99 | 0.0088 | 0.0194 |
| select/deselect rows (Set-based) | 12,849.27 | 0.0778 | 0.3041 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 70,524.50 | 0.0142 | 0.0309 |
| subscription churn (1K cycles) | 24,284.33 | 0.0412 | 0.1546 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 51,164.36 | 0.0195 | 0.0295 |
| 10K entity state tree management | 351,993.78 | 0.0028 | 0.0040 |
| heap monitoring (1000 large atoms) | 2,978.27 | 0.3358 | 0.6989 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 340,799.97 | 0.0029 | 0.0060 |
| [Manual] form reset (20 fields) | 841,871.75 | 0.0012 | 0.0015 |
| [Batch] state sync (100 atoms) | 87,944.68 | 0.0114 | 0.0230 |
| [Manual] state sync (100 atoms) | 188,314.52 | 0.0053 | 0.0066 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 64,740.42 | 0.0154 | 0.0341 |
| [Atom] filter 1000 items (Fresh Computed each time) | 19,498.46 | 0.0513 | 0.0911 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 1,537,316.37 | 0.0007 | 0.0012 |
| [Vanilla] add items → apply coupon → total | 2,583,228.79 | 0.0004 | 0.0005 |
| [Atom] add items → apply coupon → total | 1,415,131.29 | 0.0007 | 0.0011 |
| [Vanilla] update source → recalc all KPIs | 6,141,693.15 | 0.0002 | 0.0002 |
| [Atom] update source → reactive KPI pipeline | 2,762,718.86 | 0.0004 | 0.0006 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 1,116,602.70 | 0.0009 | 0.0012 |
| [Atom] creation + first .value read | 837,009.60 | 0.0012 | 0.0015 |
| [Vanilla] function call (computed baseline) | 1,081,036.74 | 0.0009 | 0.0015 |
| [Atom] lazy computed creation + first eval | 302,564.56 | 0.0033 | 0.0061 |
| [Atom] eager computed creation + first eval | 281,224.62 | 0.0036 | 0.0059 |
| [Atom] effect creation + first run + dispose | 185,042.62 | 0.0054 | 0.0097 |
| [Vanilla] variable write + read | 1,109,567.11 | 0.0009 | 0.0014 |
| [Atom] atom write + computed propagation | 451,415.67 | 0.0022 | 0.0025 |
| [Atom] atom read only — warm cache | 1,238,349.99 | 0.0008 | 0.0009 |
| [Atom] computed read only — warm cache hit | 1,259,819.86 | 0.0008 | 0.0008 |
| [Cold] new computed each iteration | 321,533.79 | 0.0031 | 0.0046 |
| [Warm] reuse computed — cache hit (source unchanged) | 1,277,850.58 | 0.0008 | 0.0008 |
| [Warm] reuse computed — cache miss (source changed) | 808,737.60 | 0.0012 | 0.0022 |
| [Cold] effect create + first run + dispose | 213,575.91 | 0.0047 | 0.0066 |
| [Warm] effect repeated trigger (x100) | 287,485.81 | 0.0035 | 0.0038 |
