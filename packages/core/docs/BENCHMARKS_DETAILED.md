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
| baseline: plain object creation | 670,658.39 | 0.0015 | 0.0017 |
| creation: primitive atom | 505,790.00 | 0.0020 | 0.0025 |
| baseline: nested object creation | 664,377.45 | 0.0015 | 0.0020 |
| creation: object atom | 503,251.48 | 0.0021 | 0.0025 |
| baseline: plain object read/write | 5,380,206.42 | 0.0002 | 0.0002 |
| read/write performance: active | 1,129,160.67 | 0.0009 | 0.0014 |
| untracked read: active | 3,966,079.49 | 0.0003 | 0.0003 |
| baseline: plain object property read | 1,524,738.74 | 0.0007 | 0.0007 |
| atom.value read | 1,518,903.85 | 0.0007 | 0.0008 |
| atom.peek() read | 1,521,718.08 | 0.0007 | 0.0007 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 612,317.40 | 0.0017 | 0.0023 |
| creation: flat computed | 266,606.77 | 0.0039 | 0.0061 |
| creation: chained computed (10 levels) | 462,566.91 | 0.0023 | 0.0030 |
| baseline: raw chained function evaluation | 434,921.02 | 0.0023 | 0.0038 |
| recomputation & cache | 261,125.89 | 0.0039 | 0.0048 |
| lazy evaluation overhead | 239,705.58 | 0.0043 | 0.0056 |
| baseline: plain function call | 1,375,270.71 | 0.0007 | 0.0008 |
| computed.value read (active) | 1,370,133.15 | 0.0007 | 0.0008 |
| computed.peek() read (active) | 1,376,034.78 | 0.0007 | 0.0008 |
| creation: async computed | 464,401.75 | 0.0023 | 0.0036 |
| read: resolved value & state | 461,927.86 | 0.0022 | 0.0024 |
| resolution: promise resolving lifecycle | 58,194.83 | 0.0174 | 0.0263 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 750,184.17 | 0.0014 | 0.0018 |
| creation & disposal | 201,321.29 | 0.0058 | 0.0066 |
| baseline: raw callback propagation | 557,039.80 | 0.0018 | 0.0020 |
| propagation: atom → computed → effect | 829,421.48 | 0.0012 | 0.0017 |
| cleanup execution | 538,475.21 | 0.0020 | 0.0026 |
| baseline: Set add + delete | 745,812.73 | 0.0014 | 0.0033 |
| atom.subscribe + unsubscribe | 1,001,903.62 | 0.0010 | 0.0014 |
| computed.subscribe + unsubscribe | 998,450.95 | 0.0011 | 0.0014 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 722,712.91 | 0.0014 | 0.0016 |
| read: lens | 538,642.65 | 0.0019 | 0.0023 |
| read: computed active | 718,441.51 | 0.0014 | 0.0016 |
| read: direct object access | 716,447.97 | 0.0014 | 0.0017 |
| baseline: raw nested object write | 1,812,583.43 | 0.0006 | 0.0006 |
| write: lens | 237,982.79 | 0.0043 | 0.0056 |
| write: manual spread | 927,876.86 | 0.0011 | 0.0014 |
| composition & scaling (100 active lenses) | 1,221,519.41 | 0.0008 | 0.0012 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 5,020,057.96 | 0.0002 | 0.0004 |
| schedule 1 microtask | 1,960,379.46 | 0.0006 | 0.0009 |
| baseline: schedule 10 native microtasks (parallel) | 698,208.18 | 0.0015 | 0.0021 |
| schedule 10 microtasks (parallel) | 438,347.33 | 0.0024 | 0.0032 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 1,055,557.50 | 0.0010 | 0.0012 |
| untracked(() => read) | 1,528,325.08 | 0.0007 | 0.0008 |
| peek() read — no context | 1,639,345.10 | 0.0006 | 0.0007 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,221,129.62 | 0.0009 | 0.0013 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 291,129.59 | 0.0036 | 0.0058 |
| batched computed chain update (x10) | 120,747.81 | 0.0086 | 0.0172 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 5,852.65 | 0.1748 | 0.4396 |
| 1 to N propagation (Fan Out 1000) | 4,433.40 | 0.2277 | 0.3866 |
| N to 1 propagation (Fan In 1000) | 35,874.35 | 0.0280 | 0.0371 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 93,190.30 | 0.0108 | 0.0188 |
| isAtom checks | 107,145.45 | 0.0094 | 0.0173 |
| isComputed checks | 106,831.86 | 0.0095 | 0.0176 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 61,651.80 | 0.0165 | 0.0277 |
| diamond pattern (1 → 10 → 10 → 1) | 271,507.91 | 0.0038 | 0.0043 |
| pyramid pattern (50 levels) | 105,231.86 | 0.0097 | 0.0202 |
| mixed dependencies (100 atoms → 200 computeds) | 613,320.92 | 0.0017 | 0.0020 |
| circular avoidance (x10) | 681,971.76 | 0.0015 | 0.0019 |
| conditional dependencies (x10) | 268,849.35 | 0.0038 | 0.0042 |
| array-based selection (x10) | 265,315.32 | 0.0038 | 0.0042 |
| batch update: 10 random cells | 310,365.96 | 0.0034 | 0.0045 |
| bulk update: replace full grid | 56,101.89 | 0.0263 | 0.1227 |
| read performance: 2500 lenses | 3,066.40 | 0.3266 | 0.3568 |
| read depth 100 lens chain (x10) | 64,685.82 | 0.0155 | 0.0240 |
| update depth 100 lens chain | 84,716.69 | 0.0119 | 0.0217 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,628.76 | 0.2166 | 0.2342 |
| [Atom] Toggle Sort | 4,596.52 | 0.2183 | 0.2364 |
| [Vanilla] Switch Filter | 395,191.13 | 0.0026 | 0.0032 |
| [Atom] Switch Filter | 136,891.19 | 0.0075 | 0.0096 |
| [Vanilla] sort + filter + paginate | 4,403.23 | 0.2276 | 0.2461 |
| [Atom] sort + filter + paginate | 4,326.00 | 0.2328 | 0.4088 |
| [Manual] update single cell (x10) | 220,292.55 | 0.0053 | 0.0145 |
| [Lens] update single cell (x10) | 131,039.86 | 0.0085 | 0.0208 |
| select/deselect rows (Set-based) | 16,176.21 | 0.0660 | 0.2471 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 69,267.91 | 0.0171 | 0.0365 |
| subscription churn (1K cycles) | 22,104.14 | 0.0467 | 0.1639 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 48,080.71 | 0.0221 | 0.0352 |
| 10K entity state tree management | 377,861.43 | 0.0031 | 0.0049 |
| heap monitoring (1000 large atoms) | 2,721.03 | 0.3797 | 0.6796 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 326,250.24 | 0.0032 | 0.0052 |
| [Manual] form reset (20 fields) | 758,330.93 | 0.0014 | 0.0020 |
| [Batch] state sync (100 atoms) | 9,410.25 | 0.1086 | 0.2408 |
| [Manual] state sync (100 atoms) | 154,219.65 | 0.0067 | 0.0116 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 91,422.82 | 0.0147 | 0.0317 |
| [Atom] filter 1000 items (Fresh Computed each time) | 13,583.31 | 0.0817 | 0.1253 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 12,163.74 | 0.0836 | 0.1026 |
| [Vanilla] add items → apply coupon → total | 2,932,921.52 | 0.0004 | 0.0005 |
| [Atom] add items → apply coupon → total | 838,206.77 | 0.0013 | 0.0021 |
| [Vanilla] update source → recalc all KPIs | 5,713,801.78 | 0.0002 | 0.0003 |
| [Atom] update source → reactive KPI pipeline | 1,084,469.75 | 0.0009 | 0.0012 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 799,239.77 | 0.0013 | 0.0022 |
| [Atom] creation + first .value read | 606,946.74 | 0.0017 | 0.0022 |
| [Vanilla] function call (computed baseline) | 780,343.50 | 0.0013 | 0.0018 |
| [Atom] lazy computed creation + first eval | 297,839.29 | 0.0035 | 0.0062 |
| [Atom] eager computed creation + first eval | 280,271.38 | 0.0038 | 0.0043 |
| [Atom] effect creation + first run + dispose | 194,529.59 | 0.0057 | 0.0114 |
| [Vanilla] variable write + read | 868,057.12 | 0.0012 | 0.0013 |
| [Atom] atom write + computed propagation | 374,028.71 | 0.0027 | 0.0032 |
| [Atom] atom read only — warm cache | 931,965.41 | 0.0011 | 0.0014 |
| [Atom] computed read only — warm cache hit | 945,290.31 | 0.0011 | 0.0014 |
| [Cold] new computed each iteration | 338,365.97 | 0.0032 | 0.0036 |
| [Warm] reuse computed — cache hit (source unchanged) | 956,288.02 | 0.0011 | 0.0013 |
| [Warm] reuse computed — cache miss (source changed) | 623,293.45 | 0.0017 | 0.0020 |
| [Cold] effect create + first run + dispose | 232,455.83 | 0.0047 | 0.0073 |
| [Warm] effect repeated trigger (x100) | 362,466.22 | 0.0028 | 0.0032 |
