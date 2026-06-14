# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-06-12
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
| baseline: plain object creation | 1,175,304.03 | 0.0009 | 0.0009 |
| creation: primitive atom | 913,579.21 | 0.0011 | 0.0014 |
| baseline: nested object creation | 1,131,179.24 | 0.0009 | 0.0009 |
| creation: object atom | 905,294.14 | 0.0011 | 0.0014 |
| baseline: plain object read/write | 6,771,688.98 | 0.0001 | 0.0002 |
| read/write performance: active | 1,202,465.11 | 0.0008 | 0.0011 |
| untracked read: active | 5,198,402.11 | 0.0002 | 0.0002 |
| baseline: plain object property read | 3,689,451.60 | 0.0003 | 0.0003 |
| atom.value read | 3,097,318.19 | 0.0003 | 0.0004 |
| atom.peek() read | 3,035,522.13 | 0.0003 | 0.0005 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 1,126,306.15 | 0.0009 | 0.0011 |
| creation: flat computed | 360,080.24 | 0.0028 | 0.0062 |
| creation: chained computed (10 levels) | 470,895.52 | 0.0021 | 0.0062 |
| baseline: raw chained function evaluation | 764,449.21 | 0.0013 | 0.0021 |
| recomputation & cache | 376,234.06 | 0.0027 | 0.0030 |
| lazy evaluation overhead | 310,203.58 | 0.0032 | 0.0076 |
| baseline: plain function call | 3,612,922.03 | 0.0003 | 0.0003 |
| computed.value read (active) | 2,746,475.46 | 0.0004 | 0.0004 |
| computed.peek() read (active) | 3,079,502.83 | 0.0003 | 0.0003 |
| creation: async computed | 677,756.40 | 0.0015 | 0.0031 |
| read: resolved value & state | 758,591.94 | 0.0013 | 0.0014 |
| resolution: promise resolving lifecycle | 1,058,619.76 | 0.0009 | 0.0017 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 859,941.79 | 0.0012 | 0.0015 |
| creation & disposal | 230,121.66 | 0.0043 | 0.0059 |
| baseline: raw callback propagation | 690,648.08 | 0.0014 | 0.0015 |
| propagation: atom → computed → effect | 1,140,417.58 | 0.0009 | 0.0011 |
| cleanup execution | 701,775.97 | 0.0014 | 0.0017 |
| baseline: Set add + delete | 880,913.65 | 0.0011 | 0.0025 |
| atom.subscribe + unsubscribe | 1,440,295.96 | 0.0007 | 0.0011 |
| computed.subscribe + unsubscribe | 1,505,922.41 | 0.0007 | 0.0009 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 1,239,734.02 | 0.0008 | 0.0009 |
| read: lens | 794,612.78 | 0.0013 | 0.0013 |
| read: computed active | 1,209,976.51 | 0.0008 | 0.0009 |
| read: direct object access | 1,205,888.68 | 0.0008 | 0.0009 |
| baseline: raw nested object write | 4,935,534.67 | 0.0002 | 0.0002 |
| write: lens | 225,995.66 | 0.0044 | 0.0049 |
| write: manual spread | 874,231.48 | 0.0011 | 0.0014 |
| composition & scaling (100 active lenses) | 2,408,017.94 | 0.0004 | 0.0007 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 5,000,401.51 | 0.0002 | 0.0003 |
| schedule 1 microtask | 2,174,245.96 | 0.0005 | 0.0007 |
| baseline: schedule 10 native microtasks (parallel) | 955,594.82 | 0.0010 | 0.0014 |
| schedule 10 microtasks (parallel) | 640,559.67 | 0.0016 | 0.0019 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,414,238.45 | 0.0004 | 0.0006 |
| untracked(() => read) | 3,671,983.27 | 0.0003 | 0.0003 |
| peek() read — no context | 4,062,048.99 | 0.0002 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,454,271.95 | 0.0007 | 0.0010 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 354,245.87 | 0.0028 | 0.0045 |
| batched computed chain update (x10) | 156,838.63 | 0.0064 | 0.0094 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 27,987.12 | 0.0357 | 0.1241 |
| 1 to N propagation (Fan Out 1000) | 10,206.23 | 0.0980 | 0.1615 |
| N to 1 propagation (Fan In 1000) | 103,002.46 | 0.0097 | 0.0269 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 176,362.35 | 0.0057 | 0.0066 |
| isAtom checks | 172,380.63 | 0.0058 | 0.0068 |
| isComputed checks | 170,424.11 | 0.0059 | 0.0069 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 254,777.38 | 0.0039 | 0.0083 |
| diamond pattern (1 → 10 → 10 → 1) | 806,247.63 | 0.0012 | 0.0025 |
| pyramid pattern (50 levels) | 328,136.09 | 0.0030 | 0.0063 |
| mixed dependencies (100 atoms → 200 computeds) | 606,971.75 | 0.0016 | 0.0025 |
| circular avoidance (x10) | 853,303.17 | 0.0012 | 0.0016 |
| conditional dependencies (x10) | 396,797.62 | 0.0025 | 0.0029 |
| array-based selection (x10) | 370,574.64 | 0.0027 | 0.0030 |
| batch update: 10 random cells | 278,849.31 | 0.0036 | 0.0066 |
| bulk update: replace full grid | 64,868.59 | 0.0154 | 0.3224 |
| read performance: 2500 lenses | 2,404.71 | 0.4159 | 0.7399 |
| read depth 100 lens chain (x10) | 63,267.45 | 0.0158 | 0.0305 |
| update depth 100 lens chain | 82,441.69 | 0.0121 | 0.0216 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,649.01 | 0.2151 | 0.2430 |
| [Atom] Toggle Sort | 9,538.78 | 0.1048 | 0.2323 |
| [Vanilla] Switch Filter | 393,291.94 | 0.0025 | 0.0031 |
| [Atom] Switch Filter | 254,432.29 | 0.0039 | 0.0079 |
| [Vanilla] sort + filter + paginate | 4,413.59 | 0.2266 | 0.2795 |
| [Atom] sort + filter + paginate | 9,075.58 | 0.1102 | 0.2378 |
| [Manual] update single cell (x10) | 195,600.83 | 0.0051 | 0.0125 |
| [Lens] update single cell (x10) | 118,418.41 | 0.0084 | 0.0209 |
| select/deselect rows (Set-based) | 14,731.93 | 0.0679 | 0.2928 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 70,227.41 | 0.0142 | 0.0249 |
| subscription churn (1K cycles) | 23,364.17 | 0.0428 | 0.1393 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 61,828.70 | 0.0162 | 0.0276 |
| 10K entity state tree management | 402,775.63 | 0.0025 | 0.0036 |
| heap monitoring (1000 large atoms) | 2,948.10 | 0.3392 | 0.6622 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 351,814.74 | 0.0028 | 0.0055 |
| [Manual] form reset (20 fields) | 852,936.96 | 0.0012 | 0.0017 |
| [Batch] state sync (100 atoms) | 100,347.65 | 0.0100 | 0.0170 |
| [Manual] state sync (100 atoms) | 184,868.72 | 0.0054 | 0.0074 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 67,328.70 | 0.0149 | 0.0280 |
| [Atom] filter 1000 items (Fresh Computed each time) | 19,384.99 | 0.0516 | 0.0905 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 1,239,870.79 | 0.0008 | 0.0013 |
| [Vanilla] add items → apply coupon → total | 2,548,705.49 | 0.0004 | 0.0007 |
| [Atom] add items → apply coupon → total | 1,509,056.29 | 0.0007 | 0.0012 |
| [Vanilla] update source → recalc all KPIs | 6,610,545.59 | 0.0002 | 0.0003 |
| [Atom] update source → reactive KPI pipeline | 2,849,385.16 | 0.0004 | 0.0007 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 1,133,854.27 | 0.0009 | 0.0012 |
| [Atom] creation + first .value read | 872,908.78 | 0.0011 | 0.0015 |
| [Vanilla] function call (computed baseline) | 1,073,047.36 | 0.0009 | 0.0014 |
| [Atom] lazy computed creation + first eval | 126,714.84 | 0.0079 | 0.0154 |
| [Atom] eager computed creation + first eval | 126,221.85 | 0.0079 | 0.0142 |
| [Atom] effect creation + first run + dispose | 104,717.34 | 0.0095 | 0.0202 |
| [Vanilla] variable write + read | 1,115,365.58 | 0.0009 | 0.0015 |
| [Atom] atom write + computed propagation | 469,198.07 | 0.0021 | 0.0031 |
| [Atom] atom read only — warm cache | 1,254,767.02 | 0.0008 | 0.0008 |
| [Atom] computed read only — warm cache hit | 1,262,296.85 | 0.0008 | 0.0008 |
| [Cold] new computed each iteration | 314,548.43 | 0.0032 | 0.0049 |
| [Warm] reuse computed — cache hit (source unchanged) | 1,271,711.07 | 0.0008 | 0.0008 |
| [Warm] reuse computed — cache miss (source changed) | 814,194.56 | 0.0012 | 0.0022 |
| [Cold] effect create + first run + dispose | 223,972.93 | 0.0045 | 0.0054 |
| [Warm] effect repeated trigger (x100) | 282,140.43 | 0.0035 | 0.0047 |
