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
| baseline: plain object creation | 1,583,420.99 | 0.0006 | 0.0007 |
| creation: primitive atom | 1,164,614.13 | 0.0009 | 0.0012 |
| baseline: nested object creation | 1,454,945.15 | 0.0007 | 0.0008 |
| creation: object atom | 1,151,687.72 | 0.0009 | 0.0012 |
| baseline: plain object read/write | 8,571,929.01 | 0.0001 | 0.0001 |
| read/write performance: active | 1,518,188.74 | 0.0007 | 0.0009 |
| untracked read: active | 6,331,879.52 | 0.0002 | 0.0002 |
| baseline: plain object property read | 4,607,072.93 | 0.0002 | 0.0002 |
| atom.value read | 3,836,515.08 | 0.0003 | 0.0003 |
| atom.peek() read | 3,939,762.55 | 0.0003 | 0.0003 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 1,370,077.13 | 0.0007 | 0.0010 |
| creation: flat computed | 509,523.18 | 0.0020 | 0.0036 |
| creation: chained computed (10 levels) | 568,763.08 | 0.0018 | 0.0025 |
| baseline: raw chained function evaluation | 960,935.43 | 0.0010 | 0.0016 |
| recomputation & cache | 464,584.95 | 0.0022 | 0.0028 |
| lazy evaluation overhead | 438,246.93 | 0.0023 | 0.0037 |
| baseline: plain function call | 4,520,839.78 | 0.0002 | 0.0003 |
| computed.value read (active) | 3,465,147.75 | 0.0003 | 0.0003 |
| computed.peek() read (active) | 3,925,023.24 | 0.0003 | 0.0003 |
| creation: async computed | 896,662.92 | 0.0011 | 0.0015 |
| read: resolved value & state | 950,178.97 | 0.0011 | 0.0012 |
| resolution: promise resolving lifecycle | 94,373.46 | 0.0106 | 0.0174 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 1,193,245.75 | 0.0008 | 0.0013 |
| creation & disposal | 317,660.87 | 0.0031 | 0.0035 |
| baseline: raw callback propagation | 892,396.40 | 0.0011 | 0.0012 |
| propagation: atom → computed → effect | 1,496,121.15 | 0.0007 | 0.0010 |
| cleanup execution | 808,207.44 | 0.0012 | 0.0015 |
| baseline: Set add + delete | 1,159,069.38 | 0.0009 | 0.0026 |
| atom.subscribe + unsubscribe | 1,885,222.85 | 0.0005 | 0.0008 |
| computed.subscribe + unsubscribe | 1,930,141.54 | 0.0005 | 0.0008 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 1,641,018.71 | 0.0006 | 0.0007 |
| read: lens | 1,015,849.05 | 0.0010 | 0.0011 |
| read: computed active | 1,558,723.15 | 0.0006 | 0.0007 |
| read: direct object access | 1,573,494.25 | 0.0006 | 0.0007 |
| baseline: raw nested object write | 6,118,206.40 | 0.0002 | 0.0002 |
| write: lens | 308,189.71 | 0.0032 | 0.0038 |
| write: manual spread | 1,134,094.26 | 0.0009 | 0.0012 |
| composition & scaling (100 active lenses) | 2,974,277.69 | 0.0003 | 0.0005 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 6,022,171.49 | 0.0002 | 0.0002 |
| schedule 1 microtask | 2,547,539.91 | 0.0004 | 0.0006 |
| baseline: schedule 10 native microtasks (parallel) | 1,159,841.03 | 0.0009 | 0.0012 |
| schedule 10 microtasks (parallel) | 738,515.44 | 0.0014 | 0.0017 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 3,136,937.85 | 0.0003 | 0.0005 |
| untracked(() => read) | 4,605,112.11 | 0.0002 | 0.0002 |
| peek() read — no context | 5,039,660.07 | 0.0002 | 0.0002 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,880,305.88 | 0.0005 | 0.0008 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 460,682.13 | 0.0022 | 0.0035 |
| batched computed chain update (x10) | 221,369.87 | 0.0045 | 0.0060 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 27,675.21 | 0.0361 | 0.0860 |
| 1 to N propagation (Fan Out 1000) | 13,703.95 | 0.0730 | 0.1076 |
| N to 1 propagation (Fan In 1000) | 120,597.33 | 0.0083 | 0.0197 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 226,020.14 | 0.0044 | 0.0068 |
| isAtom checks | 210,121.47 | 0.0048 | 0.0077 |
| isComputed checks | 214,272.27 | 0.0047 | 0.0052 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 222,413.55 | 0.0045 | 0.0096 |
| diamond pattern (1 → 10 → 10 → 1) | 748,531.61 | 0.0013 | 0.0026 |
| pyramid pattern (50 levels) | 331,647.06 | 0.0030 | 0.0062 |
| mixed dependencies (100 atoms → 200 computeds) | 599,239.42 | 0.0017 | 0.0022 |
| circular avoidance (x10) | 849,076.47 | 0.0012 | 0.0014 |
| conditional dependencies (x10) | 390,831.03 | 0.0026 | 0.0029 |
| array-based selection (x10) | 372,866.97 | 0.0027 | 0.0032 |
| batch update: 10 random cells | 290,451.58 | 0.0034 | 0.0047 |
| bulk update: replace full grid | 62,543.63 | 0.0160 | 0.0309 |
| read performance: 2500 lenses | 2,435.98 | 0.4105 | 0.4496 |
| read depth 100 lens chain (x10) | 71,889.73 | 0.0139 | 0.0269 |
| update depth 100 lens chain | 83,891.05 | 0.0119 | 0.0217 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,579.79 | 0.2184 | 0.2531 |
| [Atom] Toggle Sort | 9,374.66 | 0.1067 | 0.2312 |
| [Vanilla] Switch Filter | 403,690.90 | 0.0025 | 0.0029 |
| [Atom] Switch Filter | 255,354.47 | 0.0039 | 0.0085 |
| [Vanilla] sort + filter + paginate | 4,401.43 | 0.2272 | 0.2481 |
| [Atom] sort + filter + paginate | 8,959.73 | 0.1116 | 0.2413 |
| [Manual] update single cell (x10) | 213,771.70 | 0.0047 | 0.0100 |
| [Lens] update single cell (x10) | 129,255.72 | 0.0077 | 0.0202 |
| select/deselect rows (Set-based) | 15,347.74 | 0.0652 | 0.2569 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 72,851.19 | 0.0137 | 0.0274 |
| subscription churn (1K cycles) | 23,316.18 | 0.0429 | 0.0786 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 62,375.78 | 0.0160 | 0.0270 |
| 10K entity state tree management | 387,298.48 | 0.0026 | 0.0036 |
| heap monitoring (1000 large atoms) | 2,958.93 | 0.3380 | 0.6369 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 349,979.56 | 0.0029 | 0.0050 |
| [Manual] form reset (20 fields) | 846,664.75 | 0.0012 | 0.0019 |
| [Batch] state sync (100 atoms) | 98,429.48 | 0.0102 | 0.0215 |
| [Manual] state sync (100 atoms) | 188,976.64 | 0.0053 | 0.0073 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 65,353.24 | 0.0153 | 0.0337 |
| [Atom] filter 1000 items (Fresh Computed each time) | 19,910.23 | 0.0502 | 0.0845 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 1,413,588.69 | 0.0007 | 0.0011 |
| [Vanilla] add items → apply coupon → total | 2,736,771.73 | 0.0004 | 0.0006 |
| [Atom] add items → apply coupon → total | 1,422,429.60 | 0.0007 | 0.0010 |
| [Vanilla] update source → recalc all KPIs | 6,294,895.71 | 0.0002 | 0.0002 |
| [Atom] update source → reactive KPI pipeline | 3,068,589.43 | 0.0003 | 0.0005 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 1,158,662.76 | 0.0009 | 0.0014 |
| [Atom] creation + first .value read | 869,513.38 | 0.0012 | 0.0017 |
| [Vanilla] function call (computed baseline) | 1,133,832.98 | 0.0009 | 0.0014 |
| [Atom] lazy computed creation + first eval | 321,585.34 | 0.0031 | 0.0056 |
| [Atom] eager computed creation + first eval | 298,289.39 | 0.0034 | 0.0049 |
| [Atom] effect creation + first run + dispose | 175,563.97 | 0.0057 | 0.0097 |
| [Vanilla] variable write + read | 1,157,948.80 | 0.0009 | 0.0010 |
| [Atom] atom write + computed propagation | 452,068.00 | 0.0022 | 0.0028 |
| [Atom] atom read only — warm cache | 1,334,761.77 | 0.0007 | 0.0009 |
| [Atom] computed read only — warm cache hit | 1,333,309.41 | 0.0008 | 0.0009 |
| [Cold] new computed each iteration | 293,458.61 | 0.0034 | 0.0049 |
| [Warm] reuse computed — cache hit (source unchanged) | 1,337,952.45 | 0.0007 | 0.0009 |
| [Warm] reuse computed — cache miss (source changed) | 833,312.70 | 0.0012 | 0.0019 |
| [Cold] effect create + first run + dispose | 213,863.12 | 0.0047 | 0.0058 |
| [Warm] effect repeated trigger (x100) | 287,645.25 | 0.0035 | 0.0042 |
